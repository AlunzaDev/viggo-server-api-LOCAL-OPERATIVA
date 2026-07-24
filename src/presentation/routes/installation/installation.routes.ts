import { Router } from "express";
import { AuthMiddleware } from "../../middlewares";
import { InstallationController } from "./installation.controller";

export class InstallationRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new InstallationController();

    router.get("/status", AuthMiddleware.requireAuth, controller.getStatus);
    router.get("/cloud-projects", AuthMiddleware.requireAuth, controller.getCloudProjects);
    router.post("/project-request", AuthMiddleware.requireAuth, controller.requestProjectLink);

    return router;
  }
}
