import { Router } from "express";
import { buildLocalReportsController } from "../../dependencies";
import { requireSyncAuth } from "../../middlewares/sync-auth.middleware";

export class LocalReportsRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildLocalReportsController();

    router.use(requireSyncAuth);
    router.get("/snapshot", controller.getSnapshot);

    return router;
  }
}
