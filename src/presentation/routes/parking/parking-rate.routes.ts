import { Router, type Request, type Response } from "express";
import { buildParkingRateService } from "../../dependencies/parking.dependencies";
import { AuthMiddleware } from "../../middlewares";
import { ErrorService } from "../../services/error.service";

type ScopedRequest = Request & { localProjectId?: string; uid?: string };

/** Parking rate of this installation's project (it charges offline, so it lives here). */
export class ParkingRateRoutes {
  static get routes(): Router {
    const router = Router();
    const service = buildParkingRateService();
    // Every OPERATIVO web user is ADMIN or SUPER; what they may do comes from their modules.
    // Changing the rate belongs with tickets (SUPER always may).
    const canEdit = AuthMiddleware.requireModules("tickets");
    const handle = (action: (req: ScopedRequest) => Promise<unknown>) => async (req: Request, res: Response) => {
      try { return res.json(await action(req as ScopedRequest)); }
      catch (error) { return ErrorService.handleApiError(error, res); }
    };
    const project = (req: ScopedRequest) => String(req.localProjectId);

    // Anyone signed in (e.g. the cashier) can see the rate in force.
    router.get("/", AuthMiddleware.requireAuth, handle((req) => service.getCurrent(project(req))));
    router.put("/", AuthMiddleware.requireAuth, canEdit, handle((req) => service.save(project(req), req.body ?? {}, String(req.uid ?? ""))));
    router.get("/historial", AuthMiddleware.requireAuth, canEdit, handle(async (req) => ({ historial: await service.history(project(req)) })));
    router.post("/simular", AuthMiddleware.requireAuth, handle((req) => service.simulate(project(req), req.body ?? {})));

    return router;
  }
}
