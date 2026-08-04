import { Router } from "express";
import { buildOperationalLogsController } from "../../dependencies/operational-logs.dependencies";
import { AuthMiddleware } from "../../middlewares";

export class OperationalLogsRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildOperationalLogsController();

    router.get("/", AuthMiddleware.requireAuth, controller.list);
    router.get(
      "/project/:projectId",
      AuthMiddleware.requireAuth,
      controller.getByProject,
    );

    return router;
  }
}
