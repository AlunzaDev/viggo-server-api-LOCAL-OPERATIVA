import { NextFunction, Request, Response, Router } from "express";
import { buildInstallationController, buildLocalInstallationService } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";
import { InstallationIdentityService } from "../../services/installation/installation-identity.service";

export class InstallationRoutes {
  static get routes(): Router {
    const router = Router();
    const controller = buildInstallationController();
    const installations = buildLocalInstallationService();

    // Until the installation is linked nobody can log in (users come from the cloud with
    // the installation's own token), so linking is authorized by the project's link token
    // and the approval in ADMINISTRATIVO. Once linked with cloud credentials, a session is
    // required again. Linked without them (PROJECT_ID, seed) still counts as unlinked.
    const requireAuthOnceLinked = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const installation = await installations.findDefault();
        const linkedToCloud =
          installation?.status === "linked" && Boolean(await InstallationIdentityService.getCloudCredentials());
        if (linkedToCloud) return AuthMiddleware.requireAuth(req, res, next);
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
