import { envs } from "../../../config";
import { MonthlyFlushAdminService } from "./monthly-flush-admin.service";

export class MonthlyFlushSchedulerService {
  private intervalHandle: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly service: MonthlyFlushAdminService) {}

  async start() {
    await this.refresh();
  }

  async refresh() {
    const status = await this.service.getStatus();

    if (!status.enabled) {
      this.stop();
      return;
    }

    if (this.intervalHandle) return;

    const runTick = () => {
      void this.runOnce();
    };

    this.intervalHandle = setInterval(runTick, envs.MONTHLY_FLUSH_SCHEDULER_INTERVAL_MS);
    runTick();

    console.info(
      `[OPERATIVO flush] Scheduler enabled. Interval=${envs.MONTHLY_FLUSH_SCHEDULER_INTERVAL_MS}ms`,
    );
  }

  stop() {
    if (!this.intervalHandle) return;
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;

    try {
      const result = await this.service.runAutomaticIfDue();
      if (result) {
        console.info("[OPERATIVO flush] Automatic flush applied", result.summary);
      }
    } catch (error) {
      console.error("[OPERATIVO flush] Automatic flush failed", error);
    } finally {
      this.running = false;
    }
  }
}
