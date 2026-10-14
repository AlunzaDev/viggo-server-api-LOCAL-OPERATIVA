declare const transactionBrand: unique symbol;

/**
 * Opaque handle of an open database transaction. Services pass it through to datasources
 * without knowing what it is (a Prisma interactive transaction).
 */
export type TransactionContext = { readonly [transactionBrand]: true };

export abstract class TransactionRunner {
  /** Runs `work` in one transaction: everything it writes commits together or not at all. */
  abstract run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
