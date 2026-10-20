import { buildCashPaymentSessionRepository, buildCashRegisterCountRepository, buildCashRegisterCutRepository, buildCashRegisterModuleRepository, buildCashRegisterMovementRepository, buildCashRegisterShiftRepository, buildCashTicketPaymentRepository, buildPaymentRepository, buildTicketRepository, buildTransactionRunner } from "./repositories.dependencies";
import { PaymentHistoryController } from "../routes/payments/payment-history.controller";
import { buildParkingFeeService } from "./parking.dependencies";
import { PaymentHistoryService } from "../services/payments/payment-history.service";
import { CashTicketPaymentController } from "../routes/payments/cash-ticket-payment.controller";
import { CashRegisterService } from "../services/cash-register/cash-register.service";
import { CashTicketPaymentService } from "../services/payments/cash-ticket-payment.service";
import { buildOperationalLogsService } from "./operational-logs.dependencies";

export const buildPaymentHistoryController = (): PaymentHistoryController => {
  const paymentRepository = buildPaymentRepository();
  const service = new PaymentHistoryService(paymentRepository);

  return new PaymentHistoryController(service);
};

export const buildCashTicketPaymentController =
  (): CashTicketPaymentController => {
    const ticketRepository = buildTicketRepository();
    const paymentRepository = buildPaymentRepository();
    const cashPaymentSessionRepository = buildCashPaymentSessionRepository();
    const cashRegisterShiftRepository = buildCashRegisterShiftRepository();
    const cashRegisterMovementRepository = buildCashRegisterMovementRepository();
    const cashRegisterCountRepository = buildCashRegisterCountRepository();
    const cashRegisterCutRepository = buildCashRegisterCutRepository();
    const cashRegisterModuleRepository = buildCashRegisterModuleRepository();
    const cashRegisterService = new CashRegisterService(
      cashRegisterShiftRepository,
      cashRegisterMovementRepository,
      cashRegisterCountRepository,
      cashRegisterCutRepository,
      cashRegisterModuleRepository,
    );
    const cashTicketPaymentRepository = buildCashTicketPaymentRepository();
    const operationalLogsService = buildOperationalLogsService();

    const service = new CashTicketPaymentService(
      ticketRepository,
      cashPaymentSessionRepository,
      paymentRepository,
      cashRegisterShiftRepository,
      cashRegisterService,
      cashTicketPaymentRepository,
      operationalLogsService,
      buildTransactionRunner(),
      buildParkingFeeService(),
    );

    return new CashTicketPaymentController(service);
  };
