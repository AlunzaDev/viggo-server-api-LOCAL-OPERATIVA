import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { buildMonthlyFlushController } from "../../dependencies/monthly-flush.dependencies";
import { AuthMiddleware } from "../../middlewares";

export class MonthlyFlushRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildMonthlyFlushController();
    const adminRoles = AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER);

    router.get("/admin", AuthMiddleware.requireAuth, adminRoles, controller.status);
    router.patch("/admin/settings", AuthMiddleware.requireAuth, adminRoles, controller.updateSettings);
    router.post("/admin/run", AuthMiddleware.requireAuth, adminRoles, controller.runManual);

    return router;
  }
}
