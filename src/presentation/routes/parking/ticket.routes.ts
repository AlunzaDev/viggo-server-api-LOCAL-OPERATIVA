import { Router } from "express";
import { buildTicketController } from "../../dependencies";
import { AuthMiddleware } from "../../middlewares";

export class TicketRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildTicketController();
    const ticketModuleAccess = AuthMiddleware.requireModules("tickets");

    router.post(
      "/",
      AuthMiddleware.requireAuth,
      ticketModuleAccess,
      controller.createTicket,
    );
    router.post(
      "/createTicket",
      AuthMiddleware.requireAuth,
      ticketModuleAccess,
      controller.createTicketLegacy,
    );
    router.get("/", AuthMiddleware.requireAuth, controller.getTickets);
    router.get(
      "/usuario/:usuarioId/activo",
      AuthMiddleware.requireAuth,
      controller.getActiveTicketByUsuario,
    );
    router.get(
      "/userHistoryTickets",
      AuthMiddleware.requireAuth,
      ticketModuleAccess,
      controller.getMyHistoryTickets,
    );
    router.get(
      "/currentTicket",
      AuthMiddleware.requireAuth,
      ticketModuleAccess,
      controller.getMyCurrentTicket,
    );
    router.get(
      "/usuario/:usuarioId",
      AuthMiddleware.requireAuth,
      controller.getTicketsByUsuario,
    );
    router.post(
      "/killTicket",
      AuthMiddleware.requireAuth,
      ticketModuleAccess,
      controller.killTicketLegacy,
    );
    router.get("/:id", AuthMiddleware.requireAuth, controller.getTicketById);
    router.patch(
      "/:id",
      AuthMiddleware.requireAuth,
      ticketModuleAccess,
      controller.updateTicket,
    );
    return router;
  }
}
