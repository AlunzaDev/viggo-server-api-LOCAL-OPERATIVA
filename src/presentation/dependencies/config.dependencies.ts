import { buildConfigSyncRepository, buildSyncRepository, buildSyncTransactionRunner } from "./repositories.dependencies";
import { ConfigController } from "../routes/config/config.controller";
import { ConfigSyncScheduler } from "../services/config/config-sync.scheduler";
import { ConfigSyncService } from "../services/config/config-sync.service";
import { SyncService } from "../services/sync/sync.service";
import { buildLocalInstallationService } from "./installation.dependencies";

const buildConfigSyncService = (): ConfigSyncService => {
  const localInstallationService = buildLocalInstallationService();
  const syncService = new SyncService(
    buildSyncRepository(),
  );

  return new ConfigSyncService(
    localInstallationService,
    syncService,
    buildConfigSyncRepository(),
    buildSyncTransactionRunner(),
  );
};

export const buildConfigController = (): ConfigController => {
  return new ConfigController(buildConfigSyncService());
};

export const buildConfigSyncScheduler = (): ConfigSyncScheduler => {
  return new ConfigSyncScheduler(buildConfigSyncService());
};
