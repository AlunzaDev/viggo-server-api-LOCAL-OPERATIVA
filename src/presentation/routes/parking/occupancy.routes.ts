import { Router } from "express";
import { buildOccupancyController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class OccupancyRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildOccupancyController();

    router.get("/", AuthMiddleware.requireAuth, AuthMiddleware.requireModules("tickets"), controller.get);
    return router;
  }
}
