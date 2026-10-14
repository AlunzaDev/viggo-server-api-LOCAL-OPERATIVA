import { envs } from "../../../config";
import { OutboxPublisherService } from "./outbox-publisher.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_EVERY_MS = 60 * 60 * 1000;

export class OutboxScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastPurgeAt = 0;

  constructor(
    private readonly publisher: OutboxPublisherService,
    private readonly purgeSentBefore: (before: number) => Promise<number>,
  ) {}

  start() {
    if (!envs.OUTBOX_SYNC_ENABLED) {
      console.info("[OPERATIVO outbox] Delivery disabled");
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), envs.OUTBOX_SYNC_INTERVAL_MS);
    console.info(`[OPERATIVO outbox] Delivery enabled. Interval=${envs.OUTBOX_SYNC_INTERVAL_MS}ms`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Drains full batches until the queue is empty or delivery has to wait. */
  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      for (let batch = 0; batch < 20; batch += 1) {
        const result = await this.publisher.publishPending();
        if (result.stopped || result.sent + result.rejected === 0) break;
      }
      if (Date.now() - this.lastPurgeAt >= PURGE_EVERY_MS) {
        this.lastPurgeAt = Date.now();
        await this.purgeSentBefore(Date.now() - envs.OUTBOX_RETENTION_DAYS * DAY_MS);
      }
    } catch (error) {
      console.error("[OPERATIVO outbox] Delivery failed", error);
    } finally {
      this.running = false;
    }
  }
}
