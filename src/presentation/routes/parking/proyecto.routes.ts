import { Router } from "express";
import { buildProyectoController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

/** Read-only projection synchronized from ADMINISTRATIVO. */
export class ProyectoRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildProyectoController();

    router.get("/", AuthMiddleware.requireAuth, controller.getProyectos);
    router.get("/:id", AuthMiddleware.requireAuth, controller.getProyectoById);

    return router;
  }
}
