import { Router } from "express";
import { buildDeviceSetupController } from "../../dependencies";

export class DeviceSetupRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildDeviceSetupController();

    router.get("/catalogs", controller.catalogs);
    router.get("/proyectos/:projectId/modulos", controller.projectModules);
    return router;
  }
}
