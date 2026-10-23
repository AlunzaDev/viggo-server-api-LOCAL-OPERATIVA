import type { LocalRetentionTarget } from "../../../domain/datasources/system/local-retention.datasource";
import type { LocalRetentionRepository } from "../../../domain/repositories/system/local-retention.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LocalRetentionDays = { operation: number; audit: number; commandReceipts: number };
export type LocalRetentionRule = { target: LocalRetentionTarget; days: number };

/**
 * What the parking's PC purges and after how many days (docs/retencion.md). Cash shifts and
 * sessions go before tickets: a payment session keeps its ticket. A rule with 0 days is skipped.
 */
export const localRetentionPlan = (days: LocalRetentionDays): LocalRetentionRule[] => ([
  { target: "cash_shifts", days: days.operation },
  { target: "cash_payment_sessions", days: days.operation },
  { target: "tickets", days: days.operation },
  { target: "payments", days: days.operation },
  { target: "pension_moves", days: days.operation },
  { target: "config_sync_audits", days: days.audit },
  { target: "binding_requests", days: days.audit },
  { target: "command_receipts", days: days.commandReceipts },
] satisfies LocalRetentionRule[]).filter((rule) => rule.days > 0);

export type LocalRetentionRun = { deleted: Partial<Record<LocalRetentionTarget, number>>; complete: boolean };
export type LocalRetentionOptions = { batchSize: number; budgetMs: number; intervalMs: number; startDelayMs: number };
const DEFAULTS: LocalRetentionOptions = { batchSize: 1_000, budgetMs: 5 * 60_000, intervalMs: 6 * 60 * 60_000, startDelayMs: 10 * 60_000 };

/**
 * Keeps the parking's disk from filling up (LOCAL-OPERATIVA#26): purges in small batches what
 * the cloud already has and is older than the plan says. One installation, one process: no lock.
 */
export class LocalRetentionScheduler {
  private readonly options: LocalRetentionOptions;
  private timer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly retention: LocalRetentionRepository,
    private readonly plan: LocalRetentionRule[],
    options: Partial<LocalRetentionOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  start() {
    if (this.timer || !this.plan.length) return;
    this.startTimer = setTimeout(() => void this.runOnce(), this.options.startDelayMs);
    this.startTimer.unref();
    this.timer = setInterval(() => void this.runOnce(), this.options.intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.startTimer = null;
  }

  /** One pass over the plan; a later run continues what the time budget left. */
  async runOnce(now = Date.now()): Promise<LocalRetentionRun | null> {
    if (this.running) return null;
    this.running = true;
    const run: LocalRetentionRun = { deleted: {}, complete: true };
    const deadline = Date.now() + this.options.budgetMs;
    try {
      plan: for (const rule of this.plan) {
        const before = now - rule.days * DAY_MS;
        for (;;) {
          if (Date.now() >= deadline) {
            run.complete = false;
            break plan;
          }
          const deleted = await this.retention.purgeBatch(rule.target, before, this.options.batchSize);
          if (deleted) run.deleted[rule.target] = (run.deleted[rule.target] ?? 0) + deleted;
          if (deleted < this.options.batchSize) break;
        }
      }
      if (Object.keys(run.deleted).length || !run.complete) console.info("[OPERATIVO data retention]", JSON.stringify(run));
      return run;
    } catch (error) {
      console.error("[OPERATIVO data retention] Failed", error);
      return null;
    } finally {
      this.running = false;
    }
  }
}
