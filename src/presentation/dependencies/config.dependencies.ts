import { ConfigSyncMongoDatasource } from "../../infrastructure/datasources/config/config-sync.datasource.mongo";
import { SyncMongoDatasource } from "../../infrastructure/datasources/sync/sync.datasource.mongo";
import { ConfigSyncRepositoryImpl } from "../../infrastructure/repositories/config/config-sync.repository.impl";
import { MongoTransactionRunner } from "../../infrastructure/datasources/system/transaction-runner.mongo";
import { SyncRepositoryImpl } from "../../infrastructure/repositories/sync/sync.repository.impl";
import { ConfigController } from "../routes/config/config.controller";
import { ConfigSyncScheduler } from "../services/config/config-sync.scheduler";
import { ConfigSyncService } from "../services/config/config-sync.service";
import { SyncService } from "../services/sync/sync.service";
import { buildLocalInstallationService } from "./installation.dependencies";

const buildConfigSyncService = (): ConfigSyncService => {
  const localInstallationService = buildLocalInstallationService();
  const syncService = new SyncService(
    new SyncRepositoryImpl(new SyncMongoDatasource()),
  );

  return new ConfigSyncService(
    localInstallationService,
    syncService,
    new ConfigSyncRepositoryImpl(new ConfigSyncMongoDatasource()),
    new MongoTransactionRunner(),
  );
};

export const buildConfigController = (): ConfigController => {
  return new ConfigController(buildConfigSyncService());
};

export const buildConfigSyncScheduler = (): ConfigSyncScheduler => {
  return new ConfigSyncScheduler(buildConfigSyncService());
};
