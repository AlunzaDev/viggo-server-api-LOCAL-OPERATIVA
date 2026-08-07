import { Router } from "express";
import { MongoDatabase } from "../../data/mongo";
import { AuthRoutes } from "./auth/auth.routes";
import { LocalUserRoutes } from "./auth/local-user.routes";
import { CashRegisterRoutes } from "./cash-register/cash-register.routes";
import { ConfigRoutes } from "./config/config.routes";
import { ModuloRoutes } from "./parking/modulo.routes";
import { ProyectoRoutes } from "./parking/proyecto.routes";
import { TicketRoutes } from "./parking/ticket.routes";
import { CashTicketPaymentRoutes } from "./payments/cash-ticket-payment.routes";
import { InstallationRoutes } from "./installation/installation.routes";
import { TicketPaymentRoutes } from "./payments/ticket-payment.routes";
import { PensionMoveRoutes } from "./pension/pension-move.routes";
import { PensionPassRoutes } from "./pension/pension-pass.routes";
import { PensionRoutes } from "./pension/pension.routes";
import { SyncRoutes } from "./sync/sync.routes";
import { LocalReportsRoutes } from "./local-reports/local-reports.routes";
import { OperationalLogsRoutes } from "./operational-logs/operational-logs.routes";
import { MonthlyFlushRoutes } from "./monthly-flush/monthly-flush.routes";
import { LocalProjectScopeMiddleware } from "../middlewares";

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    router.get("/api/ping", (_req, res) => {
      res.status(200).json({
        service: "viggo-operativo",
        status: "ok",
        message: "pong",
      });
    });

    router.get("/api/health", (_req, res) => {
      const health = MongoDatabase.getHealthSnapshot();
      res.status(health.status === "ok" ? 200 : 503).json({
        service: "viggo-operativo",
        ...health,
      });
    });

    // Identidad local de usuarios previamente sincronizados desde ADMINISTRATIVO.
    router.use("/api/auth", AuthRoutes.routes);
    router.use("/api/usuarios", LocalUserRoutes.routes);
    router.use("/api/installation", InstallationRoutes.routes);

    const requireLocalProject = LocalProjectScopeMiddleware.requireLinkedProject;

    // Proyecciones administrativas de solo lectura + runtime local de dispositivos.
    router.use("/api/proyectos", requireLocalProject, ProyectoRoutes.routes);
    router.use("/api/modulos", requireLocalProject, ModuloRoutes.routes);
    router.use("/api/pensiones", requireLocalProject, PensionRoutes.routes);
    router.use("/api/pension-pass", requireLocalProject, PensionPassRoutes.routes);

    // Dominio operativo local.
    router.use("/api/tickets", requireLocalProject, TicketRoutes.routes);
    router.use("/api/pension-moves", requireLocalProject, PensionMoveRoutes.routes);
    router.use("/api/cash-register", requireLocalProject, CashRegisterRoutes.routes);
    router.use("/api/config", ConfigRoutes.routes);
    router.use("/api/payments", requireLocalProject, TicketPaymentRoutes.routes);
    router.use("/api/cash-payments", requireLocalProject, CashTicketPaymentRoutes.routes);
    router.use("/api/sync", SyncRoutes.routes);
    router.use("/api/local-reports", requireLocalProject, LocalReportsRoutes.routes);
    router.use("/api/operational-logs", requireLocalProject, OperationalLogsRoutes.routes);
    router.use("/api/monthly-flush", requireLocalProject, MonthlyFlushRoutes.routes);

    return router;
  }
}
