import { Router } from "express";
import { buildPensionController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

/** Read-only plans synchronized from NUBEADMIN. */
export class PensionRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildPensionController();

    router.get("/", AuthMiddleware.requireAuth, controller.getPensiones);
    router.get(
      "/proyecto/:proyectoId",
      AuthMiddleware.requireAuth,
      controller.getPensionesByProyecto,
    );
    router.get("/:id", AuthMiddleware.requireAuth, controller.getPensionById);

    return router;
  }
}
