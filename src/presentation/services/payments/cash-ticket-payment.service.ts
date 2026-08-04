import { envs } from "../../../config";
import { CashPaymentSessionEntity } from "../../../domain/entities/payments/cash-payment-session.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { CashRegisterShiftRepository } from "../../../domain/repository/cash-register/cash-register-shift.repository";
import { TicketRepository } from "../../../domain/repository/parking/ticket.repository";
import { CashPaymentSessionRepository } from "../../../domain/repository/payments/cash-payment-session.repository";
import { PaymentRepository } from "../../../domain/repository/payments/payment.repository";
import { CashTicketPaymentRepository } from "../../../domain/repository/payments/cash-ticket-payment.repository";
import { CashRegisterService } from "../cash-register/cash-register.service";
import { OperationalLogsService } from "../operational-logs/operational-logs.service";

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
    private readonly mongoDatasource: CashTicketPaymentRepository,
    private readonly operationalLogsService: OperationalLogsService,
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
      const duration = Math.round((now - ticket.horaInicio) / 1000 / 60);
      const amount = duration < 60 ? 10 : 20;

      const updatedTicket = await this.ticketRepository.update(ticket.id, {
        horaConsulta: now,
        duracion: duration,
        monto: amount,
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

    const modulo = await this.mongoDatasource.findModuloById(moduloId);
    if (!modulo) {
      throw CustomError.notFound("Caja no encontrada");
    }

    const moduloProjectId = String(modulo.get("proyecto") ?? "");
    if (!moduloProjectId || moduloProjectId !== ticket.proyecto) {
      throw CustomError.badRequest(
        "La caja seleccionada no pertenece al proyecto del ticket",
      );
    }

    const moduloTipo = String(modulo.get("tipo") ?? "").trim().toUpperCase();
    if (moduloTipo !== "POS") {
      throw CustomError.badRequest("El modulo seleccionado no es un POS");
    }

    if (modulo.get("estado") === false) {
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
        moduloId: String(modulo._id),
        ticketId: ticket.id,
        paymentSessionId: existingSession.id,
        flowId: ticket.id,
        metadata: {
          idBoleto: ticket.idBoleto,
          moduloIdentificador:
            String(modulo.get("identificador") ?? "").trim() || undefined,
          moduloNombre: String(modulo.get("nombre") ?? "").trim() || undefined,
          amountExpected: existingSession.amountExpected,
          amountReceived: existingSession.amountReceived,
        },
      });
      return existingSession;
    }

    const activeShift =
      await this.cashRegisterShiftRepository.findOpenByModuloId(String(modulo._id));

    if (!activeShift) {
      throw CustomError.badRequest(
        "La caja seleccionada no tiene un turno abierto",
      );
    }

    this.ensureShiftOperator(activeShift.openedByUserId, actor);

    const createdSession = await this.cashPaymentSessionRepository.create({
      ticketId: ticket.id,
      idBoleto: ticket.idBoleto,
      status: "pending_cash",
      amountExpected: ticket.monto,
      amountReceived: 0,
      changeAmount: 0,
      moduloId: String(modulo._id),
      moduloIdentificador: String(modulo.get("identificador") ?? "").trim() || undefined,
      moduloNombre: String(modulo.get("nombre") ?? "").trim() || undefined,
      deviceId: String(modulo.get("identificador") ?? "").trim() || undefined,
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
            moduloId: String(modulo._id),
            moduloIdentificador:
              String(modulo.get("identificador") ?? "").trim() || undefined,
            moduloNombre: String(modulo.get("nombre") ?? "").trim() || undefined,
            deviceId:
              String(modulo.get("identificador") ?? "").trim() || undefined,
            cashRegisterShiftId: activeShift.id,
          },
        },
      ],
    });

    await this.operationalLogsService.logEvent({
      scope: "payment",
      type: "cash_session_started",
      source: "app",
      message: "Se inicio una sesion de cobro en efectivo para el boleto escaneado.",
      projectId: ticket.proyecto,
      moduloId: String(modulo._id),
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
    const mongoSession = await this.mongoDatasource.startSession();
    let finalSession: CashPaymentSessionEntity | null = null;

    try {
      await mongoSession.withTransaction(async () => {
        const sessionDocument = await this.mongoDatasource.findSessionById(
          options.session.id,
          mongoSession,
        );

        if (!sessionDocument) {
          throw CustomError.notFound("Sesion de cobro no encontrada");
        }

        const currentSession = CashPaymentSessionEntity.fromObject(
          sessionDocument.toObject(),
        );

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
          finalSession = currentSession;
          return;
        }

        const ticketDocument = await this.mongoDatasource.findTicketById(
          currentSession.ticketId,
          mongoSession,
        );

        if (!ticketDocument) {
          throw CustomError.notFound("Ticket no encontrado");
        }

        if (ticketDocument.get("pagado") === true) {
          throw CustomError.badRequest("El ticket ya fue pagado");
        }

        const shiftDocument = currentSession.cashRegisterShiftId
          ? await this.mongoDatasource.findShiftById(
              currentSession.cashRegisterShiftId,
              mongoSession,
            )
          : null;

        if (currentSession.cashRegisterShiftId && !shiftDocument) {
          throw CustomError.badRequest("El turno de caja asociado no existe");
        }

        if (shiftDocument) {
          if (String(shiftDocument.get("status")) !== "open") {
            throw CustomError.badRequest("El turno de caja ya no esta abierto");
          }
          this.ensureShiftOperator(
            String(shiftDocument.get("openedByUserId") ?? ""),
            options.actor,
          );
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

        const updatedSessionDocument =
          await this.mongoDatasource.updateSession(
            currentSession.id,
            {
              $set: {
                amountReceived: nextAmountReceived,
                changeAmount: nextChange,
                status: nextStatus,
                completedAt: nextStatus === "paid" ? now : undefined,
              },
              $push: {
                events: {
                  $each: events,
                },
              },
            },
            mongoSession,
          );

        if (!updatedSessionDocument) {
          throw CustomError.notFound("Sesion de cobro no encontrada");
        }

        if (nextStatus !== "paid") {
          finalSession = CashPaymentSessionEntity.fromObject(
            updatedSessionDocument.toObject(),
          );
          return;
        }

        await this.mongoDatasource.markTicketPaid(
          currentSession.ticketId,
          now,
          mongoSession,
        );

        const providerReference = `pos_session_${currentSession.id}`;
        let paymentDocument =
          await this.mongoDatasource.findPaymentByProviderReference(
            providerReference,
            mongoSession,
          );

        if (!paymentDocument) {
          const projectDocument = await this.mongoDatasource.findProjectById(
            ticketDocument.get("proyecto"),
            mongoSession,
          );

          paymentDocument = await this.mongoDatasource.createPayment(
            {
                user: ticketDocument.get("usuario"),
                type: "ticket",
                concept: "Pago de ticket en POS",
                amount: Number(ticketDocument.get("monto") ?? 0),
                currency: envs.PAYMENT_CURRENCY.toUpperCase(),
                status: "succeeded",
                paidAt: now,
                providerReference,
                paymentMethod: undefined,
                reference: {
                  type: "ticket",
                  id: currentSession.ticketId,
                },
                parking: projectDocument
                  ? {
                      id: String(projectDocument._id),
                      name: String(projectDocument.get("nombre") ?? ""),
                      city: String(projectDocument.get("ciudad") ?? ""),
                    }
                  : undefined,
                rawProviderStatus: "pos_succeeded",
            },
            mongoSession,
          );
        }

        if (currentSession.cashRegisterShiftId && shiftDocument) {
          const existingMovement =
            await this.mongoDatasource.findMovementByCashPaymentSessionId(
              currentSession.id,
              mongoSession,
            );

          if (!existingMovement) {
            await this.mongoDatasource.createMovement(
              {
                  shiftId: currentSession.cashRegisterShiftId,
                  proyectoId: String(ticketDocument.get("proyecto") ?? ""),
                  moduloId: currentSession.moduloId,
                  createdByUserId: options.actor.userId,
                  createdByUserName:
                    options.actor.userName ||
                    String(shiftDocument.get("openedByUserName") ?? "") ||
                    undefined,
                  type: "ticket_payment_income",
                  direction: "in",
                  concept: "Cobro de boleto en efectivo",
                  amount: currentSession.amountExpected,
                  createdAt: now,
                  relatedTicketId: currentSession.ticketId,
                  relatedPaymentId: String(paymentDocument._id),
                  relatedCashPaymentSessionId: currentSession.id,
                  metadata: {
                    amountReceived: nextAmountReceived,
                    changeAmount: nextChange,
                    source: "cash_payment_transaction",
                  },
              },
              mongoSession,
            );
          }
        }

        finalSession = CashPaymentSessionEntity.fromObject(
          updatedSessionDocument.toObject(),
        );
      });
    } catch (error) {
      if (this.isMongoTransactionUnsupported(error)) {
        throw CustomError.internalServer(
          "MongoDB debe correr como replica set o Atlas para confirmar cobros POS con transacciones",
          undefined,
          "MONGO_TRANSACTIONS_REQUIRED",
        );
      }

      throw error;
    } finally {
      await mongoSession.endSession();
    }

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

  private isMongoTransactionUnsupported(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const message = String((error as { message?: unknown }).message ?? "");

    return (
      message.includes("Transaction numbers are only allowed") ||
      message.includes("replica set member or mongos") ||
      message.includes("Transaction") && message.includes("not supported")
    );
  }
}
