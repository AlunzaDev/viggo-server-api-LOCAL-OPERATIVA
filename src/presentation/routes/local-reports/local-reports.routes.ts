import { Router } from "express";
import { requireSyncAuth } from "../../middlewares/sync-auth.middleware";
import { LocalReportsController } from "./local-reports.controller";

export class LocalReportsRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new LocalReportsController();

    router.use(requireSyncAuth);
    router.get("/snapshot", controller.getSnapshot);

    return router;
  }
}
