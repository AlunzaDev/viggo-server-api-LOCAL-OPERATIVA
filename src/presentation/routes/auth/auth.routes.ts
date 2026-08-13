import { Router } from "express";

import { buildAuthController } from "../../dependencies";
import { AuthMiddleware, rateLimitMiddleware } from "../../middlewares";

export class AuthRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildAuthController();

    const authRateLimit = rateLimitMiddleware({
      windowMs: 15 * 60 * 1000,
      maxRequests: 12,
    });

    // Temporalmente desactivado en desarrollo para no bloquear pruebas manuales.
    // Reactivar antes de producción:
    // router.post("/login-correo", authRateLimit, controller.loginCorreo);
    router.post("/login-correo", controller.loginCorreo);

    // router.post("/login-telefono", authRateLimit, controller.loginTelefono);
    router.post("/login-telefono", controller.loginTelefono);

    router.post("/renew", AuthMiddleware.requireAuth, controller.renewToken);
    router.patch(
      "/me/barrier-blaster-high-score",
      AuthMiddleware.requireAuth,
      controller.updateBarrierBlasterHighScore,
    );

    return router;
  }
}
