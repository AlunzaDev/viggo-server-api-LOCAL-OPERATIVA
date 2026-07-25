import { Router } from "express";
import { buildInstallationController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class InstallationRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildInstallationController();

    router.get("/status", AuthMiddleware.requireAuth, controller.getStatus);
    router.get("/cloud-projects", AuthMiddleware.requireAuth, controller.getCloudProjects);
    router.post("/project-request", AuthMiddleware.requireAuth, controller.requestProjectLink);

    return router;
  }
}
