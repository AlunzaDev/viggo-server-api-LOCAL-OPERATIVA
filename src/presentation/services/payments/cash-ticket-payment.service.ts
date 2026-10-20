import { envs } from "../../../config";
import type { ParkingFeeService } from "../parking/parking-fee.service";
import { CashPaymentSessionEntity } from "../../../domain/entities/payments/cash-payment-session.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { CashRegisterShiftRepository } from "../../../domain/repositories/cash-register/cash-register-shift.repository";
import { TicketRepository } from "../../../domain/repositories/parking/ticket.repository";
import { CashPaymentSessionRepository } from "../../../domain/repositories/payments/cash-payment-session.repository";
import { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";
import { CashTicketPaymentRepository } from "../../../domain/repositories/payments/cash-ticket-payment.repository";
import type { TransactionRunner } from "../../../domain/datasources/system/transaction";
import { UniqueConstraintError } from "../../../domain/errors/unique-constraint.error";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { OperationalLogsService } from "../operational-logs/operational-logs.service";
import { getModuloTypeCapabilities } from "../../../domain/entities/parking/module-type-capabilities.entity";
import { parseModuloTipo } from "../../../domain/entities/parking/module-type.entity";

export interface CashPaymentActorContext {
  userId: string;
  userName?: string;
  allowedProjectIds: string[];
  isSuperAdmin: boolean;
}

export class CashTicketPaymentService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly cashPaymentSessionRepository: CashPaymentSessionRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly cashRegisterShiftRepository: CashRegisterShiftRepository,
    private readonly cashRegisterService: CashRegisterService,
    private readonly cashPayments: CashTicketPaymentRepository,
    private readonly operationalLogsService: OperationalLogsService,
    private readonly transactions: TransactionRunner,
    private readonly fees: ParkingFeeService,
  ) {}

  async resolveTicketFromQr(qrValue: string, allowedProjectIds: string[] = []) {
    const normalizedQrValue = String(qrValue ?? "").trim();

    if (!normalizedQrValue) {
      throw CustomError.badRequest("El QR del boleto es obligatorio");
    }

    const ticket =
      (await this.ticketRepository.findByIdBoleto(normalizedQrValue)) ||
      (await this.ticketRepository.findById(normalizedQrValue));

    if (!ticket) {
      await this.operationalLogsService.logIncident({
        scope: "payment",
        type: "qr_ticket_not_found",
        severity: "warning",
        source: "app",
        message: "Se intento cobrar un QR que no corresponde a un boleto disponible.",
        metadata: {
          qrValue: normalizedQrValue,
        },
      });
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, allowedProjectIds);

    if (ticket.pagado) {
      await this.operationalLogsService.logIncident({
        scope: "payment",
        type: "qr_ticket_already_paid",
        severity: "warning",
        source: "app",
        message: "Se escaneo un boleto que ya estaba marcado como pagado.",
        projectId: ticket.proyecto,
        ticketId: ticket.id,
        flowId: ticket.id,
        metadata: {
          qrValue: normalizedQrValue,
          idBoleto: ticket.idBoleto,
        },
      });
      throw CustomError.badRequest("El ticket ya fue pagado");
    }

    let currentTicket = ticket;

    if (ticket.horaConsulta <= 0 || ticket.monto <= 0) {
      const now = Date.now();
      // Same pricing as the app: the project's rate, or the legacy one while none is set.
      const quote = await this.fees.quote(ticket.proyecto, ticket.horaInicio, now);

      const updatedTicket = await this.ticketRepository.update(ticket.id, {
        horaConsulta: now,
        duracion: quote.duracion,
        monto: quote.monto,
        tarifaVersion: quote.tarifaVersion,
      });

      if (!updatedTicket) {
        throw CustomError.notFound("Ticket no encontrado");
      }

      currentTicket = updatedTicket;
    }

    const activeSession =
      await this.cashPaymentSessionRepository.findActiveByTicketId(
        currentTicket.id,
      );

    await this.operationalLogsService.logEvent({
      scope: "payment",
      type: "qr_ticket_resolved",
      source: "app",
      message: activeSession
        ? "El QR del boleto se resolvio y ya existia una sesion de cobro activa."
        : "El QR del boleto se resolvio correctamente para iniciar cobro.",
      projectId: currentTicket.proyecto,
      ticketId: currentTicket.id,
      paymentSessionId: activeSession?.id,
      flowId: currentTicket.id,
      metadata: {
        qrValue: normalizedQrValue,
        idBoleto: currentTicket.idBoleto,
        amountExpected: currentTicket.monto,
        hasActiveSession: Boolean(activeSession),
      },
    });

    return {
      ticket: currentTicket,
      hasActiveSession: Boolean(activeSession),
      activeSession,
    };
  }

  async startCashSession(
    ticketId: string,
    moduloId: string,
    actor: CashPaymentActorContext,
  ) {
    const ticket = await this.ticketRepository.findById(ticketId);

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, actor.allowedProjectIds);

    if (ticket.pagado) {
      throw CustomError.badRequest("El ticket ya fue pagado");
    }

    if (ticket.monto <= 0) {
      throw CustomError.badRequest("El ticket no tiene monto por cobrar");
    }

    const modulo = await this.cashPayments.findModuloById(moduloId);
    if (!modulo) {
      throw CustomError.notFound("Caja no encontrada");
    }

    const moduloProjectId = String(modulo.proyecto ?? "");
    if (!moduloProjectId || moduloProjectId !== ticket.proyecto) {
      throw CustomError.badRequest(
        "La caja seleccionada no pertenece al proyecto del ticket",
      );
    }

    const moduloTipo = parseModuloTipo(modulo.tipo);
    if (!moduloTipo || !getModuloTypeCapabilities(moduloTipo).canChargePayments) {
      throw CustomError.badRequest("El modulo seleccionado no es un POS");
    }

    if (modulo.estado === false) {
      throw CustomError.badRequest("La caja seleccionada esta inactiva");
    }

    const existingSession =
      await this.cashPaymentSessionRepository.findActiveByTicketId(ticket.id);

    if (existingSession) {
      await this.operationalLogsService.logEvent({
        scope: "payment",
        type: "cash_session_reused",
        source: "app",
        message: "Se reutilizo una sesion de cobro en efectivo que ya estaba activa.",
        projectId: ticket.proyecto,
        moduloId: modulo.id,
        ticketId: ticket.id,
        paymentSessionId: existingSession.id,
        flowId: ticket.id,
        metadata: {
          idBoleto: ticket.idBoleto,
          moduloIdentificador:
            String(modulo.identificador ?? "").trim() || undefined,
          moduloNombre: String(modulo.nombre ?? "").trim() || undefined,
          amountExpected: existingSession.amountExpected,
          amountReceived: existingSession.amountReceived,
        },
      });
      return existingSession;
    }

    const activeShift =
      await this.cashRegisterShiftRepository.findOpenByModuloId(modulo.id);

    if (!activeShift) {
      throw CustomError.badRequest(
        "La caja seleccionada no tiene un turno abierto",
      );
    }

    this.ensureShiftOperator(activeShift.openedByUserId, actor);

    let createdSession: CashPaymentSessionEntity;
    try {
      createdSession = await this.cashPaymentSessionRepository.create({
        ticketId: ticket.id,
        idBoleto: ticket.idBoleto,
        status: "pending_cash",
        amountExpected: ticket.monto,
        amountReceived: 0,
        changeAmount: 0,
        moduloId: modulo.id,
        moduloIdentificador: String(modulo.identificador ?? "").trim() || undefined,
        moduloNombre: String(modulo.nombre ?? "").trim() || undefined,
        deviceId: String(modulo.identificador ?? "").trim() || undefined,
        cashRegisterShiftId: activeShift.id,
        startedAt: Date.now(),
        completedAt: undefined,
        cancelledAt: undefined,
        events: [
          {
            type: "session_created",
            createdAt: Date.now(),
            payload: {
              ticketId: ticket.id,
              idBoleto: ticket.idBoleto,
              moduloId: modulo.id,
              moduloIdentificador:
                String(modulo.identificador ?? "").trim() || undefined,
              moduloNombre: String(modulo.nombre ?? "").trim() || undefined,
              deviceId:
                String(modulo.identificador ?? "").trim() || undefined,
              cashRegisterShiftId: activeShift.id,
            },
          },
        ],
      });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const concurrentSession =
        await this.cashPaymentSessionRepository.findActiveByTicketId(ticket.id);
      if (!concurrentSession) throw error;
      return concurrentSession;
    }

    await this.operationalLogsService.logEvent({
      scope: "payment",
      type: "cash_session_started",
      source: "app",
      message: "Se inicio una sesion de cobro en efectivo para el boleto escaneado.",
      projectId: ticket.proyecto,
      moduloId: modulo.id,
      ticketId: ticket.id,
      paymentSessionId: createdSession.id,
      flowId: ticket.id,
      metadata: {
        idBoleto: ticket.idBoleto,
        moduloIdentificador: createdSession.moduloIdentificador,
        moduloNombre: createdSession.moduloNombre,
        amountExpected: createdSession.amountExpected,
        cashRegisterShiftId: activeShift.id,
        startedByUserId: actor.userId,
        startedByUserName: actor.userName,
      },
    });

    return createdSession;
  }

  async registerCashInsertion(
    sessionId: string,
    amount: number,
    actor: CashPaymentActorContext,
    rawEvent?: Record<string, unknown>,
  ) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, actor.allowedProjectIds);

    if (!this.isSessionActive(session.status)) {
      throw CustomError.badRequest("La sesion ya no esta activa");
    }

    const idempotencyKey =
      typeof rawEvent?.idempotencyKey === "string"
        ? rawEvent.idempotencyKey.trim()
        : "";
    const duplicateEvent = idempotencyKey
      ? session.events.find((event) => {
          const payload = event.payload ?? {};
          return (
            event.type === "cash_inserted" &&
            typeof payload.idempotencyKey === "string" &&
            payload.idempotencyKey === idempotencyKey
          );
        })
      : undefined;

    if (duplicateEvent) {
      return session;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw CustomError.badRequest("El monto registrado en POS no es valido");
    }

    if (session.cashRegisterShiftId) {
      const activeShift = await this.cashRegisterShiftRepository.findById(
        session.cashRegisterShiftId,
      );
      if (!activeShift) {
        throw CustomError.badRequest("El turno de caja asociado no existe");
      }
      this.ensureShiftOperator(activeShift.openedByUserId, actor);
    }

    return this.commitCashInsertionTransaction({
      session,
      amount,
      rawEvent,
      actor,
    });
  }

  async cancelSession(
    sessionId: string,
    actor: CashPaymentActorContext,
    cancellationReason?: string,
  ) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, actor.allowedProjectIds);

    if (session.cashRegisterShiftId) {
      const activeShift = await this.cashRegisterShiftRepository.findById(
        session.cashRegisterShiftId,
      );
      if (activeShift) {
        this.ensureShiftOperator(activeShift.openedByUserId, actor);
      }
    }

    if (!this.isSessionActive(session.status)) {
      return session;
    }

    const reason = String(cancellationReason ?? "").trim();
    if (session.amountReceived > 0 && reason.length < 5) {
      throw CustomError.badRequest(
        "Captura un motivo de cancelacion cuando el cobro ya tiene efectivo registrado",
      );
    }

    const cancelledAt = Date.now();

    const updatedSession = await this.cashPaymentSessionRepository.update(
      session.id,
      {
        status: "cancelled",
        cancelledAt,
      },
    );

    if (!updatedSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    await this.cashPaymentSessionRepository.appendEvent(updatedSession.id, {
      type: "session_cancelled",
      createdAt: cancelledAt,
      payload: {
        amountReceived: updatedSession.amountReceived,
        reason: reason || undefined,
        cancelledByUserId: actor.userId,
        cancelledByUserName: actor.userName,
      },
    });

    const finalSession = await this.cashPaymentSessionRepository.findById(
      updatedSession.id,
    );

    if (!finalSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    await this.operationalLogsService.logIncident({
      scope: "payment",
      type: "cash_session_cancelled",
      severity: finalSession.amountReceived > 0 ? "warning" : "info",
      source: "app",
      message:
        finalSession.amountReceived > 0
          ? "Se cancelo una sesion de cobro despues de registrar efectivo."
          : "Se cancelo una sesion de cobro antes de completar el pago.",
      projectId: ticket.proyecto,
      moduloId: finalSession.moduloId,
      ticketId: ticket.id,
      paymentSessionId: finalSession.id,
      flowId: ticket.id,
      metadata: {
        idBoleto: ticket.idBoleto,
        amountExpected: finalSession.amountExpected,
        amountReceived: finalSession.amountReceived,
        reason: reason || undefined,
        cancelledByUserId: actor.userId,
        cancelledByUserName: actor.userName,
      },
    });

    return finalSession;
  }

  async getSessionById(sessionId: string, allowedProjectIds: string[] = []) {
    const session = await this.cashPaymentSessionRepository.findById(sessionId);

    if (!session) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const ticket = await this.ticketRepository.findById(session.ticketId);
    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    this.ensureProjectAccess(ticket.proyecto, allowedProjectIds);

    return session;
  }

  private isSessionActive(status: string) {
    return (
      status === "created" ||
      status === "pending_cash" ||
      status === "partially_paid"
    );
  }

  private ensureProjectAccess(projectId: string, allowedProjectIds: string[]) {
    if (allowedProjectIds.length === 0) return;

    if (!allowedProjectIds.includes(projectId)) {
      throw CustomError.forbidden(
        "El ticket pertenece a otro proyecto y no puedes cobrarlo con este acceso",
      );
    }
  }

  private ensureShiftOperator(openedByUserId: string, actor: CashPaymentActorContext) {
    if (actor.isSuperAdmin) return;

    if (openedByUserId !== actor.userId) {
      throw CustomError.forbidden(
        "Solo el usuario que abrio el turno puede operar esta caja",
      );
    }
  }

  private async commitCashInsertionTransaction(options: {
    session: CashPaymentSessionEntity;
    amount: number;
    rawEvent?: Record<string, unknown>;
    actor: CashPaymentActorContext;
  }) {
    // Session update, ticket, payment and cash movement commit together or not at all.
    const finalSession = await this.transactions.run(async (tx): Promise<CashPaymentSessionEntity> => {
      const currentSession = await this.cashPayments.findSessionById(options.session.id, tx);

      if (!currentSession) {
        throw CustomError.notFound("Sesion de cobro no encontrada");
      }

      if (!this.isSessionActive(currentSession.status)) {
        throw CustomError.badRequest("La sesion ya no esta activa");
      }

      const idempotencyKey =
        typeof options.rawEvent?.idempotencyKey === "string"
          ? options.rawEvent.idempotencyKey.trim()
          : "";
      const duplicateEvent = idempotencyKey
        ? currentSession.events.find((event) => {
            const payload = event.payload ?? {};
            return (
              event.type === "cash_inserted" &&
              typeof payload.idempotencyKey === "string" &&
              payload.idempotencyKey === idempotencyKey
            );
          })
        : undefined;

      if (duplicateEvent) {
        return currentSession;
      }

      const ticket = await this.cashPayments.findTicketById(currentSession.ticketId, tx);

      if (!ticket) {
        throw CustomError.notFound("Ticket no encontrado");
      }

      if (ticket.pagado === true) {
        throw CustomError.badRequest("El ticket ya fue pagado");
      }

      const shift = currentSession.cashRegisterShiftId
        ? await this.cashPayments.findShiftById(currentSession.cashRegisterShiftId, tx)
        : null;

      if (currentSession.cashRegisterShiftId && !shift) {
        throw CustomError.badRequest("El turno de caja asociado no existe");
      }

      if (shift) {
        if (String(shift.status) !== "open") {
          throw CustomError.badRequest("El turno de caja ya no esta abierto");
        }
        this.ensureShiftOperator(String(shift.openedByUserId ?? ""), options.actor);
      }

      const now = Date.now();
      const nextAmountReceived = currentSession.amountReceived + options.amount;
      const nextChange =
        nextAmountReceived > currentSession.amountExpected
          ? nextAmountReceived - currentSession.amountExpected
          : 0;
      const nextStatus =
        nextAmountReceived >= currentSession.amountExpected
          ? "paid"
          : "partially_paid";

      const events: CashPaymentSessionEntity["events"] = [
        {
          type: "cash_inserted",
          amount: options.amount,
          payload: options.rawEvent,
          createdAt: now,
        },
      ];

      if (nextStatus === "paid") {
        events.push(
          {
            type: "change_calculated",
            amount: nextChange,
            createdAt: now,
            payload: {
              amountExpected: currentSession.amountExpected,
              amountReceived: nextAmountReceived,
            },
          },
          {
            type: "session_completed",
            createdAt: now,
            payload: {
              ticketId: currentSession.ticketId,
              paidAt: now,
              completedByUserId: options.actor.userId,
              completedByUserName: options.actor.userName,
            },
          },
        );
      }

      const updatedSession = await this.cashPayments.applySessionInsertion(
        currentSession.id,
        {
          amountReceived: nextAmountReceived,
          changeAmount: nextChange,
          status: nextStatus,
          completedAt: nextStatus === "paid" ? now : undefined,
          events,
        },
        tx,
      );

      if (!updatedSession) {
        throw CustomError.notFound("Sesion de cobro no encontrada");
      }

      if (nextStatus !== "paid") {
        return updatedSession;
      }

      await this.cashPayments.markTicketPaid(currentSession.ticketId, now, tx);

      const providerReference = `pos_session_${currentSession.id}`;
      let paymentId = await this.cashPayments.findPaymentIdByProviderReference(providerReference, tx);

      if (!paymentId) {
        const project = await this.cashPayments.findProjectById(ticket.proyecto, tx);

        paymentId = await this.cashPayments.createPayment(
          {
            user: ticket.usuario,
            amount: Number(ticket.monto ?? 0),
            currency: envs.PAYMENT_CURRENCY.toUpperCase(),
            paidAt: now,
            providerReference,
            ticketId: currentSession.ticketId,
            parking: project ? { id: project.id, name: project.nombre, city: project.ciudad } : undefined,
          },
          tx,
        );
      }

      if (currentSession.cashRegisterShiftId && shift) {
        const movementExists = await this.cashPayments.hasMovementForCashPaymentSession(currentSession.id, tx);

        if (!movementExists) {
          await this.cashPayments.createIncomeMovement(
            {
              shiftId: currentSession.cashRegisterShiftId,
              proyectoId: String(ticket.proyecto ?? ""),
              moduloId: currentSession.moduloId,
              createdByUserId: options.actor.userId,
              createdByUserName: options.actor.userName || String(shift.openedByUserName ?? "") || undefined,
              amount: currentSession.amountExpected,
              createdAt: now,
              relatedTicketId: currentSession.ticketId,
              relatedPaymentId: paymentId,
              relatedCashPaymentSessionId: currentSession.id,
              metadata: {
                amountReceived: nextAmountReceived,
                changeAmount: nextChange,
                source: "cash_payment_transaction",
              },
            },
            tx,
          );
        }
      }

      return updatedSession;
    });

    if (!finalSession) {
      throw CustomError.notFound("Sesion de cobro no encontrada");
    }

    const resolvedSession = finalSession as CashPaymentSessionEntity;
    const finalTicket = await this.ticketRepository.findById(resolvedSession.ticketId);

    await this.operationalLogsService.logEvent({
      scope: "payment",
      type: resolvedSession.status === "paid" ? "cash_payment_completed" : "cash_inserted",
      source: "device",
      message:
        resolvedSession.status === "paid"
          ? "El cobro en efectivo se completo correctamente desde la caja."
          : "La caja registro una insercion de efectivo en la sesion activa.",
      projectId: finalTicket?.proyecto,
      moduloId: resolvedSession.moduloId,
      ticketId: resolvedSession.ticketId,
      paymentSessionId: resolvedSession.id,
      flowId: resolvedSession.ticketId,
      metadata: {
        idBoleto: resolvedSession.idBoleto,
        insertedAmount: options.amount,
        amountExpected: resolvedSession.amountExpected,
        amountReceived: resolvedSession.amountReceived,
        changeAmount: resolvedSession.changeAmount,
        cashRegisterShiftId: resolvedSession.cashRegisterShiftId,
        rawEvent: options.rawEvent,
        processedByUserId: options.actor.userId,
        processedByUserName: options.actor.userName,
      },
    });

    return resolvedSession;
  }


}
