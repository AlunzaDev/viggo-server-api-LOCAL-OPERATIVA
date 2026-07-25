import { LocalInstallationMongoDatasource } from "../../infrastructure/datasources/installation/local-installation.datasource.mongo";
import { SyncMongoDatasource } from "../../infrastructure/datasources/sync/sync.datasource.mongo";
import { LocalInstallationRepositoryImpl } from "../../infrastructure/repositories/installation/local-installation.repository.impl";
import { SyncRepositoryImpl } from "../../infrastructure/repositories/sync/sync.repository.impl";
import { ConfigController } from "../routes/config/config.controller";
import { ConfigSyncService } from "../services/config/config-sync.service";
import { LocalInstallationService } from "../services/installation/local-installation.service";
import { SyncService } from "../services/sync/sync.service";

export const buildConfigController = (): ConfigController => {
  const localInstallationService = new LocalInstallationService(
    new LocalInstallationRepositoryImpl(new LocalInstallationMongoDatasource()),
  );
  const syncService = new SyncService(
    new SyncRepositoryImpl(new SyncMongoDatasource()),
  );

  return new ConfigController(
    new ConfigSyncService(localInstallationService, syncService),
  );
};
