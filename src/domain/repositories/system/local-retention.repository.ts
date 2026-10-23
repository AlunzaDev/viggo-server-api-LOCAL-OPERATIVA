import type { LocalRetentionTarget } from "../../datasources/system/local-retention.datasource";

export abstract class LocalRetentionRepository {
  abstract purgeBatch(target: LocalRetentionTarget, before: number, limit: number): Promise<number>;
}
