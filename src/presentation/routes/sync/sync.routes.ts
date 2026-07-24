import { Router } from "express";
import { requireSyncAuth } from "../../middlewares";
import { SyncController } from "./sync.controller";

export class SyncRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new SyncController();

    router.use(requireSyncAuth);
    router.get("/status", controller.status);
    router.put("/snapshots/access", controller.applyAccessSnapshot);

    return router;
  }
}

