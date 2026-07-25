import { Router } from "express";
import { buildSyncController } from "../../dependencies";
import { requireSyncAuth } from "../../middlewares";

export class SyncRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildSyncController();

    router.use(requireSyncAuth);
    router.get("/status", controller.status);
    router.put("/snapshots/access", controller.applyAccessSnapshot);
    router.put("/snapshots/configuration", controller.applyConfigurationSnapshot);

    return router;
  }
}
