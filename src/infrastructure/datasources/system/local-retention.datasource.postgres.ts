import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import { LocalRetentionDatasource, type LocalRetentionTarget } from "../../../domain/datasources/system/local-retention.datasource";

/** The row has no outbox event still waiting to reach the cloud (sent ones may be purged already). */
const confirmed = (aggregateType: string, idColumn: Prisma.Sql) => Prisma.sql`NOT EXISTS (
  SELECT 1 FROM outbox_events o WHERE o.aggregate_type = ${aggregateType} AND o.aggregate_id = ${idColumn}::text AND o.sent_at IS NULL)`;

export class LocalRetentionPostgresDatasource extends LocalRetentionDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async purgeBatch(target: LocalRetentionTarget, before: number, limit: number): Promise<number> {
    const cutoff = new Date(before);
    switch (target) {
      case "cash_shifts":
        return this.purgeCashShifts(cutoff, limit);
      case "cash_payment_sessions":
        // Sessions outside any shift, finished, and not referred to by a cash movement.
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM cash_payment_sessions s WHERE s.id IN (
            SELECT s.id FROM cash_payment_sessions s
            WHERE s.cash_register_shift_id IS NULL
              AND s.status IN ('paid', 'cancelled', 'expired', 'failed')
              AND COALESCE(s.completed_at, s.cancelled_at, s.started_at) < ${cutoff}
              AND NOT EXISTS (SELECT 1 FROM cash_register_movements m WHERE m.related_cash_payment_session_id = s.id)
              AND ${confirmed("cash_payment_session", Prisma.sql`s.id`)}
            LIMIT ${limit})`);
      case "tickets":
        // Closed tickets only (an exit); a payment session still pointing at one keeps it.
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM tickets t WHERE t.id IN (
            SELECT t.id FROM tickets t
            WHERE t.hora_salida IS NOT NULL AND t.hora_salida < ${cutoff}
              AND NOT EXISTS (SELECT 1 FROM cash_payment_sessions s WHERE s.ticket_id = t.id)
              AND ${confirmed("ticket", Prisma.sql`t.id`)}
            LIMIT ${limit})`);
      case "payments":
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM payments p WHERE p.id IN (
            SELECT p.id FROM payments p
            WHERE p.status <> 'pending' AND p.updated_at < ${cutoff} AND ${confirmed("payment", Prisma.sql`p.id`)}
            LIMIT ${limit})`);
      case "pension_moves":
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM pension_moves m WHERE m.id IN (
            SELECT m.id FROM pension_moves m WHERE m.fecha < ${cutoff} AND ${confirmed("pension_move", Prisma.sql`m.id`)}
            LIMIT ${limit})`);
      case "config_sync_audits":
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM config_sync_audits WHERE id IN (
            SELECT id FROM config_sync_audits WHERE started_at < ${cutoff} LIMIT ${limit})`);
      case "binding_requests":
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM modulo_device_binding_requests WHERE id IN (
            SELECT id FROM modulo_device_binding_requests
            WHERE status IN ('APPROVED', 'REJECTED') AND resolved_at < ${cutoff} LIMIT ${limit})`);
      case "command_receipts":
        return this.db.$executeRaw(Prisma.sql`
          DELETE FROM mobile_command_receipts WHERE operation_id IN (
            SELECT operation_id FROM mobile_command_receipts WHERE processed_at < ${cutoff} LIMIT ${limit})`);
      default:
        return 0;
    }
  }

  /**
   * Closed shifts with everything they hold, in the order their keys require: movements, payment
   * sessions (their events go in cascade), counts (their lines too), cuts, and then the shifts.
   * A shift goes only when neither it nor anything in it is waiting to reach the cloud.
   */
  private purgeCashShifts(cutoff: Date, limit: number) {
    return this.db.$transaction(async (tx) => {
      const ids = (await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT sh.id FROM cash_register_shifts sh
        WHERE sh.status IN ('closed', 'reconciled', 'cancelled') AND sh.closed_at < ${cutoff}
          AND ${confirmed("cash_register_shift", Prisma.sql`sh.id`)}
          AND NOT EXISTS (SELECT 1 FROM cash_register_movements m WHERE m.shift_id = sh.id AND NOT ${confirmed("cash_register_movement", Prisma.sql`m.id`)})
          AND NOT EXISTS (SELECT 1 FROM cash_register_cuts c WHERE c.shift_id = sh.id AND NOT ${confirmed("cash_register_cut", Prisma.sql`c.id`)})
          AND NOT EXISTS (SELECT 1 FROM cash_payment_sessions s WHERE s.cash_register_shift_id = sh.id
            AND (s.status NOT IN ('paid', 'cancelled', 'expired', 'failed') OR NOT ${confirmed("cash_payment_session", Prisma.sql`s.id`)}))
          -- A movement of another shift pointing at one of its sessions keeps the shift.
          AND NOT EXISTS (SELECT 1 FROM cash_payment_sessions s JOIN cash_register_movements m ON m.related_cash_payment_session_id = s.id
            WHERE s.cash_register_shift_id = sh.id AND m.shift_id <> sh.id)
        LIMIT ${limit}`)).map((row) => row.id);
      if (!ids.length) return 0;
      const list = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
      await tx.$executeRaw(Prisma.sql`DELETE FROM cash_register_movements WHERE shift_id IN (${list})`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM cash_payment_sessions WHERE cash_register_shift_id IN (${list})`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM cash_register_counts WHERE shift_id IN (${list})`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM cash_register_cuts WHERE shift_id IN (${list})`);
      return tx.$executeRaw(Prisma.sql`DELETE FROM cash_register_shifts WHERE id IN (${list})`);
    });
  }
}
