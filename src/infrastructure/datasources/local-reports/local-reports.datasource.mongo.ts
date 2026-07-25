import { MongoDatabase } from "../../../data/mongo";
import { CashRegisterMovementModel } from "../../../data/mongo/models/cash-register/cash-register-movement.schema";
import { CashRegisterShiftModel } from "../../../data/mongo/models/cash-register/cash-register-shift.schema";
import { TicketModel } from "../../../data/mongo/models/parking/ticket.schema";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { CashPaymentSessionModel } from "../../../data/mongo/models/payments/cash-payment-session.schema";
import { LocalInstallationModel } from "../../../data/mongo/models/system/local-installation.schema";
import {
  LocalReportsDatasource,
  type LocalReportsSnapshotPayload,
} from "../../../domain/datasources/local-reports/local-reports.datasource";

const MAX_RECENT_ROWS = 50;

export class LocalReportsMongoDatasource implements LocalReportsDatasource {
  getInstallation() {
    return LocalInstallationModel.findOne({ key: "default" }).lean();
  }

  getHealth() {
    return MongoDatabase.getHealthSnapshot();
  }

  async getSnapshotData(payload: LocalReportsSnapshotPayload) {
    const projectFilter = payload.proyectoId ? { proyecto: payload.proyectoId } : {};
    const cashProjectFilter = payload.proyectoId ? { proyectoId: payload.proyectoId } : {};

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
        { $match: { ...projectFilter, horaInicio: { $gte: payload.from, $lte: payload.to } } },
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
        { $match: { paidAt: { $gte: payload.from, $lte: payload.to } } },
        { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
      ]),
      CashPaymentSessionModel.aggregate([
        { $match: { startedAt: { $gte: payload.from, $lte: payload.to } } },
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
        { $match: { ...cashProjectFilter, createdAt: { $gte: payload.from, $lte: payload.to } } },
        { $group: { _id: "$direction", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
      ]),
      CashRegisterShiftModel.find({ ...cashProjectFilter, status: "open" })
        .sort({ openedAt: -1 })
        .limit(MAX_RECENT_ROWS)
        .lean(),
      TicketModel.find({ ...projectFilter, horaInicio: { $gte: payload.from, $lte: payload.to } })
        .sort({ horaInicio: -1 })
        .limit(MAX_RECENT_ROWS)
        .lean(),
      CashPaymentSessionModel.find({ startedAt: { $gte: payload.from, $lte: payload.to } })
        .sort({ startedAt: -1 })
        .limit(MAX_RECENT_ROWS)
        .lean(),
      CashRegisterMovementModel.find({
        ...cashProjectFilter,
        createdAt: { $gte: payload.from, $lte: payload.to },
      })
        .sort({ createdAt: -1 })
        .limit(MAX_RECENT_ROWS)
        .lean(),
    ]);

    return {
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
    };
  }
}
