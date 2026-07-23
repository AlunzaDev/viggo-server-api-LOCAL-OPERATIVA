import { Router } from "express";
import { buildPaymentHistoryController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class TicketPaymentRoutes {
  static get routes(): Router {
    const router = Router();

    const paymentHistoryController = buildPaymentHistoryController();
    const paymentModuleAccess = AuthMiddleware.requireModules("payments");

    router.get(
      "/history",
      AuthMiddleware.requireAuth,
      paymentModuleAccess,
      paymentHistoryController.getHistory,
    );
    router.get(
      "/history/:paymentId",
      AuthMiddleware.requireAuth,
      paymentModuleAccess,
      paymentHistoryController.getPaymentDetail,
    );

    return router;
  }
}
