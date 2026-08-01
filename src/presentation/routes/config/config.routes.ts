import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildConfigController } from "../../dependencies";
import { AuthMiddleware, requireSyncAuth } from "../../middlewares";

export class ConfigRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildConfigController();
    const adminRoles = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);

    router.get("/status", AuthMiddleware.requireAuth, adminRoles, controller.status);
    router.get("/sync-audits", AuthMiddleware.requireAuth, adminRoles, controller.getSyncAudits);
    router.post("/sync-now", AuthMiddleware.requireAuth, adminRoles, controller.syncNow);
    router.post("/sync-now/service", requireSyncAuth, controller.syncNowFromService);

    return router;
  }
}
