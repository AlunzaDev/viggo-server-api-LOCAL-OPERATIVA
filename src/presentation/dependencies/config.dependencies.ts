import { LocalInstallationMongoDatasource } from "../../infrastructure/datasources/installation/local-installation.datasource.mongo";
import { SyncMongoDatasource } from "../../infrastructure/datasources/sync/sync.datasource.mongo";
import { LocalInstallationRepositoryImpl } from "../../infrastructure/repositories/installation/local-installation.repository.impl";
import { SyncRepositoryImpl } from "../../infrastructure/repositories/sync/sync.repository.impl";
import { ConfigController } from "../routes/config/config.controller";
import { ConfigSyncScheduler } from "../services/config/config-sync.scheduler";
import { ConfigSyncService } from "../services/config/config-sync.service";
import { LocalInstallationService } from "../services/installation/local-installation.service";
import { SyncService } from "../services/sync/sync.service";

const buildConfigSyncService = (): ConfigSyncService => {
  const localInstallationService = new LocalInstallationService(
    new LocalInstallationRepositoryImpl(new LocalInstallationMongoDatasource()),
  );
  const syncService = new SyncService(
    new SyncRepositoryImpl(new SyncMongoDatasource()),
  );

  return new ConfigSyncService(localInstallationService, syncService);
};

export const buildConfigController = (): ConfigController => {
  return new ConfigController(buildConfigSyncService());
};

export const buildConfigSyncScheduler = (): ConfigSyncScheduler => {
  return new ConfigSyncScheduler(buildConfigSyncService());
};
