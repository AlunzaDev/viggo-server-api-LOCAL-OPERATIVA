import { OutboxPostgresDatasource } from "../../infrastructure/datasources/system/outbox.datasource.postgres";
import { OutboxRepositoryImpl } from "../../infrastructure/repositories/system/outbox.repository.impl";
import { OutboxPublisherService } from "../services/outbox/outbox-publisher.service";
import { OutboxScheduler } from "../services/outbox/outbox.scheduler";
import { buildLocalInstallationService } from "./installation.dependencies";

/** The outbox only exists in Postgres (events are written by database triggers). */
export const buildOutboxScheduler = (): OutboxScheduler => {
  const repository = new OutboxRepositoryImpl(new OutboxPostgresDatasource());
  const publisher = new OutboxPublisherService(repository, buildLocalInstallationService());
  return new OutboxScheduler(publisher, (before) => repository.purgeSentBefore(before));
};
