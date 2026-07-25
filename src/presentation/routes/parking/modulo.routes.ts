import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildModuloController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class ModuloRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildModuloController();
    const localAdmin = AuthMiddleware.requireRoles(
      AUTH_ROLES.ADMIN,
      AUTH_ROLES.SUPER,
    );
    const moduleAccess = AuthMiddleware.requireModules("modules");

    router.get("/", AuthMiddleware.requireAuth, controller.getModulos);
    router.get(
      "/pending-device-bindings",
      AuthMiddleware.requireAuth,
      localAdmin,
      moduleAccess,
      controller.getPendingBindings,
    );
    router.get(
      "/proyecto/:proyectoId",
      AuthMiddleware.requireAuth,
      controller.getModulosByProyecto,
    );
    router.get(
      "/identificador/:identificador",
      AuthMiddleware.requireAuth,
      controller.getModuloByIdentificador,
    );
    router.get(
      "/:id/submodulos",
      AuthMiddleware.requireAuth,
      controller.getSubmodulos,
    );
    router.get("/:id", AuthMiddleware.requireAuth, controller.getModuloById);

    router.patch(
      "/:id/device-binding/reset",
      AuthMiddleware.requireAuth,
      localAdmin,
      moduleAccess,
      controller.resetDeviceBinding,
    );
    router.patch(
      "/:id/device-binding/approve",
      AuthMiddleware.requireAuth,
      localAdmin,
      moduleAccess,
      controller.approveDeviceBindingRequest,
    );
    router.patch(
      "/:id/device-binding/reject",
      AuthMiddleware.requireAuth,
      localAdmin,
      moduleAccess,
      controller.rejectDeviceBindingRequest,
    );
    router.patch(
      "/:id/device-binding/pending",
      AuthMiddleware.requireAuth,
      localAdmin,
      moduleAccess,
      controller.reopenDeviceBindingRequest,
    );

    return router;
  }
}
