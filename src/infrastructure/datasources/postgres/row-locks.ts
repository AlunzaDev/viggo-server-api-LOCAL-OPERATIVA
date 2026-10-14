import { Prisma } from "../../../generated/prisma/client";
import type { PrismaDb } from "../system/transaction-runner.postgres";

/** Tables whose rows are locked while a payment is applied. */
type LockableTable = "tickets" | "cash_payment_sessions";

/**
 * SELECT ... FOR UPDATE on one row: concurrent transactions that lock the same row wait
 * until this one commits, then read the committed state (no double payment).
 * Only meaningful inside a transaction.
 */
export const lockRow = async (db: PrismaDb, table: LockableTable, id: string): Promise<void> => {
  await db.$queryRaw`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id}::uuid FOR UPDATE`;
};
