import { NextFunction, Request, Response, Router } from "express";
import { buildInstallationController, buildLocalInstallationService } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class InstallationRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildInstallationController();
    const installations = buildLocalInstallationService();

    // Until the installation is linked nobody can log in (users come from the cloud with
    // the installation's own token), so linking is authorized by the project's link token
    // and the approval in ADMINISTRATIVO. Once linked, a session is required again.
    const requireAuthOnceLinked = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const installation = await installations.findDefault();
        if (installation?.status === "linked") return AuthMiddleware.requireAuth(req, res, next);
        return next();
      } catch (error) {
        return next(error);
      }
    };

    // Public: the web shows the linking screen before the login.
    router.get("/status", controller.getStatus);
    router.post("/link-preview", requireAuthOnceLinked, controller.previewProjectLink);
    router.post("/project-request", requireAuthOnceLinked, controller.requestProjectLink);

    return router;
  }
}
