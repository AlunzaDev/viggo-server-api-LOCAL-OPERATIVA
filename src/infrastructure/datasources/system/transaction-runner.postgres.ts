import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import { TransactionRunner, type TransactionContext } from "../../../domain/datasources/system/transaction";

export type PrismaDb = Prisma.TransactionClient;

/**
 * The Prisma client to use for a call: the open transaction when there is one,
 * otherwise the shared client (each call is then its own transaction).
 */
export const prismaDb = (tx?: TransactionContext): PrismaDb =>
  (tx as unknown as PrismaDb | undefined) ?? PostgresDatabase.client;

export interface PostgresTransactionOptions {
  /** Max time the whole transaction may take before Prisma rolls it back. */
  timeoutMs?: number;
  /** Max time to wait for a pooled connection. */
  maxWaitMs?: number;
}

export class PostgresTransactionRunner extends TransactionRunner {
  constructor(private readonly options: PostgresTransactionOptions = {}) {
    super();
  }

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return PostgresDatabase.client.$transaction(
      (tx) => work(tx as unknown as TransactionContext),
      {
        timeout: this.options.timeoutMs ?? 10_000,
        maxWait: this.options.maxWaitMs ?? 5_000,
      },
    );
  }
}
