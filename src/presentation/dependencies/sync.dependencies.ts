import { buildSyncRepository } from "./repositories.dependencies";
import { SyncController } from "../routes/sync/sync.controller";
import { buildModuloService } from "./parking.dependencies";
import { SyncService } from "../services/sync/sync.service";

export const buildSyncController = (): SyncController => {
  const repository = buildSyncRepository();
  return new SyncController(new SyncService(repository), buildModuloService());
};
