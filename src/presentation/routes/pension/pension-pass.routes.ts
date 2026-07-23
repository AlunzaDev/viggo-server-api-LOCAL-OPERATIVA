import { Router } from "express";
import { buildPensionPassController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class PensionPassRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildPensionPassController();
    const passAccess = AuthMiddleware.requireModules("pensionPasses");

    router.get("/", AuthMiddleware.requireAuth, controller.getPensionPasses);
    router.get(
      "/pension/:pensionId",
      AuthMiddleware.requireAuth,
      controller.getPensionPassesByPension,
    );
    router.get(
      "/usuario/:usuarioId",
      AuthMiddleware.requireAuth,
      controller.getPensionPassesByUsuario,
    );
    router.get(
      "/getPensionsPassByUser",
      AuthMiddleware.requireAuth,
      passAccess,
      controller.getMyPensionPasses,
    );
    router.post(
      "/open-barrier-with-pension-pass",
      AuthMiddleware.requireAuth,
      passAccess,
      controller.openBarrierWithPensionPass,
    );
    router.get(
      "/pensionMovesByPensionPass/:id",
      AuthMiddleware.requireAuth,
      controller.getPensionMovesByPensionPass,
    );
    router.get("/:id", AuthMiddleware.requireAuth, controller.getPensionPassById);

    return router;
  }
}
