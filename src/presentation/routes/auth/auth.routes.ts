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

    router.post("/login-correo", authRateLimit, controller.loginCorreo);

    router.post("/login-telefono", authRateLimit, controller.loginTelefono);

    router.post("/renew", AuthMiddleware.requireAuth, controller.renewToken);

    return router;
  }
}
