/**
 * What the parking's PC can purge (docs/retencion.md). The operation kinds only lose rows the
 * cloud already has: rows with an unsent outbox event are kept, however old.
 */
export const LOCAL_RETENTION_TARGETS = [
  // A closed cash shift goes as a whole: its movements, payment sessions, counts and cuts.
  "cash_shifts",
  "cash_payment_sessions",
  "tickets",
  "payments",
  "pension_moves",
  "config_sync_audits",
  "binding_requests",
  "command_receipts",
] as const;
export type LocalRetentionTarget = (typeof LOCAL_RETENTION_TARGETS)[number];

export abstract class LocalRetentionDatasource {
  /** Deletes at most `limit` rows (shifts, for cash_shifts) older than `before`; returns how many. */
  abstract purgeBatch(target: LocalRetentionTarget, before: number, limit: number): Promise<number>;
}
