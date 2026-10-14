import { startSession, type ClientSession } from "mongoose";
import { TransactionRunner, type TransactionContext } from "../../../domain/datasources/system/transaction";
import { CustomError } from "../../../domain/errors/custom.error";

/** The Mongo session behind a TransactionContext created by MongoTransactionRunner. */
export const mongoSession = (tx?: TransactionContext): ClientSession | undefined =>
  tx as unknown as ClientSession | undefined;

const isTransactionUnsupported = (error: unknown) => {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  return (
    message.includes("Transaction numbers are only allowed") ||
    message.includes("replica set member or mongos") ||
    (message.includes("Transaction") && message.includes("not supported"))
  );
};

export class MongoTransactionRunner extends TransactionRunner {
  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const session = await startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session as unknown as TransactionContext);
      });
      return result as T;
    } catch (error) {
      if (isTransactionUnsupported(error)) {
        throw CustomError.internalServer(
          "MongoDB debe correr como replica set o Atlas para confirmar cobros POS con transacciones",
          undefined,
          "MONGO_TRANSACTIONS_REQUIRED",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
