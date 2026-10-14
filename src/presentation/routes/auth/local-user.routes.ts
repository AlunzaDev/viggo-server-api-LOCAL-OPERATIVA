import { buildAuthRepository } from "../../dependencies/repositories.dependencies";
import { Router } from "express";
import { AUTH_ROLES } from "../../../domain/constants";
import { AuthMiddleware } from "../../middlewares";
import { LocalUserController } from "./local-user.controller";

export class LocalUserRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = new LocalUserController(
      buildAuthRepository(),
    );
    router.use(
      AuthMiddleware.requireAuth,
      AuthMiddleware.requireRoles(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER),
      AuthMiddleware.requireModules("pensions", "pensionPasses"),
    );
    router.get("/", controller.list);
    router.get("/:id", controller.getById);
    return router;
  }
}
