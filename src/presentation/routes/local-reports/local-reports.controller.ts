import { Request, Response } from "express";
import { MongoDatabase } from "../../../data/mongo";
import { CashRegisterMovementModel } from "../../../data/mongo/models/cash-register/cash-register-movement.schema";
import { CashRegisterShiftModel } from "../../../data/mongo/models/cash-register/cash-register-shift.schema";
import { TicketModel } from "../../../data/mongo/models/parking/ticket.schema";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { CashPaymentSessionModel } from "../../../data/mongo/models/payments/cash-payment-session.schema";
import { LocalInstallationModel } from "../../../data/mongo/models/system/local-installation.schema";
import { ErrorService } from "../../services/error.service";
import { InstallationIdentityService } from "../../services/installation/installation-identity.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RECENT_ROWS = 50;

const toNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getRange = (req: Request) => {
  const now = Date.now();
  const from = toNumber(req.query.from, now - DAY_MS);
  const to = toNumber(req.query.to, now);
  return from <= to ? { from, to } : { from: to, to: from };
};

export class LocalReportsController {
  getSnapshot = async (req: Request, res: Response) => {
    try {
      const installationId = await InstallationIdentityService.getInstallationId();
      const installation = await LocalInstallationModel.findOne({ key: "default" }).lean();
      const proyectoId = String(req.query.proyectoId ?? installation?.proyectoId ?? "").trim();
      const { from, to } = getRange(req);

      const projectFilter = proyectoId ? { proyecto: proyectoId } : {};
      const cashProjectFilter = proyectoId ? { proyectoId } : {};

      const [
        ticketStats,
        paymentStats,
        cashSessionStats,
        movementStats,
        openShifts,
        recentTickets,
        recentCashSessions,
        recentMovements,
      ] = await Promise.all([
        TicketModel.aggregate([
          { $match: { ...projectFilter, horaInicio: { $gte: from, $lte: to } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              paid: { $sum: { $cond: ["$pagado", 1, 0] } },
              unpaid: { $sum: { $cond: ["$pagado", 0, 1] } },
              amount: { $sum: "$monto" },
            },
          },
        ]),
        PaymentModel.aggregate([
          { $match: { paidAt: { $gte: from, $lte: to } } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
        ]),
        CashPaymentSessionModel.aggregate([
          { $match: { startedAt: { $gte: from, $lte: to } } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              expected: { $sum: "$amountExpected" },
              received: { $sum: "$amountReceived" },
              change: { $sum: "$changeAmount" },
            },
          },
        ]),
        CashRegisterMovementModel.aggregate([
          { $match: { ...cashProjectFilter, createdAt: { $gte: from, $lte: to } } },
          {
            $group: {
              _id: "$direction",
              count: { $sum: 1 },
              amount: { $sum: "$amount" },
            },
          },
        ]),
        CashRegisterShiftModel.find({ ...cashProjectFilter, status: "open" })
          .sort({ openedAt: -1 })
          .limit(MAX_RECENT_ROWS)
          .lean(),
        TicketModel.find({ ...projectFilter, horaInicio: { $gte: from, $lte: to } })
          .sort({ horaInicio: -1 })
          .limit(MAX_RECENT_ROWS)
          .lean(),
        CashPaymentSessionModel.find({ startedAt: { $gte: from, $lte: to } })
          .sort({ startedAt: -1 })
          .limit(MAX_RECENT_ROWS)
          .lean(),
        CashRegisterMovementModel.find({
          ...cashProjectFilter,
          createdAt: { $gte: from, $lte: to },
        })
          .sort({ createdAt: -1 })
          .limit(MAX_RECENT_ROWS)
          .lean(),
      ]);

      return res.status(200).json({
        mode: "direct-local-query",
        generatedAt: Date.now(),
        installation: {
          installationId,
          status: installation?.status ?? "pending",
          proyectoId: installation?.proyectoId ?? null,
          proyectoNombre: installation?.proyectoNombre ?? null,
          proyectoIdentificador: installation?.proyectoIdentificador ?? null,
        },
        range: { from, to },
        health: MongoDatabase.getHealthSnapshot(),
        summary: {
          tickets: ticketStats[0] ?? { total: 0, paid: 0, unpaid: 0, amount: 0 },
          payments: paymentStats,
          cashSessions: cashSessionStats,
          cashMovements: movementStats,
          openShifts: openShifts.length,
        },
        openShifts,
        recent: {
          tickets: recentTickets,
          cashSessions: recentCashSessions,
          cashMovements: recentMovements,
        },
        futureEventBridge: {
          enabled: false,
          note: "Outbox/inbox queda reservado para reintentos offline; este snapshot usa consulta directa NUBEADMIN -> LOCALOPE.",
        },
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
