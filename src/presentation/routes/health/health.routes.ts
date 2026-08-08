import { Router } from "express";
import { HealthController } from "./health.controller";

export class HealthRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new HealthController();

    router.get("/", controller.summary);
    router.get("/db", controller.db);
    router.get("/local-project", controller.localProject);
    router.get("/devices", controller.devices);

    return router;
  }
}
