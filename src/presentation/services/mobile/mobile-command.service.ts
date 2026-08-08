import { envs } from "../../../config";
import { MobileCommandReceiptModel } from "../../../data/mongo";
import { CustomError } from "../../../domain/errors/custom.error";
import { buildTicketService } from "../../dependencies/parking.dependencies";
import { InstallationIdentityService } from "../installation/installation-identity.service";
import { LocalInstallationService } from "../installation/local-installation.service";
import mongoose from "mongoose";
import { TicketModel } from "../../../data/mongo";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { InstallationTokenCryptoService } from "../installation/installation-token-crypto.service";

type CloudOperation = {
  operationId: string;
  type: string;
  proyectoId: string;
  userId: string;
  payload: Record<string, unknown>;
};

export class MobileCommandService {
  private readonly ticketService = buildTicketService();
  private syncToken = "";
  constructor(private readonly installations: LocalInstallationService) {}

  async processNext() {
    const installation = await this.installations.findDefault();
    if (installation?.status !== "linked" || !installation.proyectoId) return false;
    this.syncToken = installation.encryptedSyncToken
      ? InstallationTokenCryptoService.decrypt(installation.encryptedSyncToken)
      : envs.SYNC_SERVICE_TOKEN;
    const response = await this.cloudFetch("/api/sync/mobile-commands/next");
    if (response.status === 204) return false;
    const body = await response.json() as { operation?: CloudOperation };
    if (!response.ok || !body.operation) throw new Error("Comando cloud invalido");
    const operation = body.operation;

    try {
      if (operation.proyectoId !== installation.proyectoId) {
        throw CustomError.forbidden("El comando pertenece a otro proyecto");
      }
      let receipt = await MobileCommandReceiptModel.findOne({ operationId: operation.operationId }).lean();
      if (!receipt) {
        const result = await this.execute(operation);
        receipt = await MobileCommandReceiptModel.findOneAndUpdate(
          { operationId: operation.operationId },
          { $setOnInsert: { operationId: operation.operationId, type: operation.type, result, processedAt: Date.now() } },
          { upsert: true, new: true },
        ).lean();
      }
      await this.complete(operation.operationId, { success: true, result: receipt?.result ?? {} });
    } catch (error) {
      await this.complete(operation.operationId, {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
    return true;
  }

  private async execute(operation: CloudOperation) {
    if (operation.type === "CREATE_TICKET") {
      const moduleToken = String(operation.payload.moduleToken ?? "").trim();
      if (!moduleToken) throw CustomError.badRequest("moduleToken es requerido");
      const existing = await this.ticketService.getActiveTicketByUsuario(operation.userId);
      const ticket = existing ?? await this.ticketService.createTicketFromModuleToken(operation.userId, moduleToken);
      return { ticket: await this.ticketService.toLegacyTicketResponse(ticket) };
    }

    if (operation.type === "QUOTE_TICKET") {
      const ticketId = String(operation.payload.ticketId ?? "").trim();
      const ticket = await this.ticketService.getTicketById(ticketId);
      if (ticket.usuario !== operation.userId || ticket.pagado) {
        throw CustomError.forbidden("El ticket no esta disponible para cobro");
      }
      const quoted = await this.ticketService.getActiveTicketByUsuario(operation.userId);
      if (!quoted || quoted.id !== ticket.id) throw CustomError.badRequest("Ticket inactivo");
      return { ticket: await this.ticketService.toLegacyTicketResponse(quoted), amount: quoted.monto };
    }

    if (operation.type === "APPLY_TICKET_PAYMENT") {
      return this.applyCloudPayment(operation);
    }

    if (operation.type === "EXIT_TICKET") {
      const moduleToken = String(operation.payload.moduleToken ?? "").trim();
      const ticket = await this.ticketService.killTicketFromModuleToken(operation.userId, moduleToken);
      return { ticket: await this.ticketService.toLegacyTicketResponse(ticket) };
    }

    throw CustomError.badRequest("Tipo de comando movil no soportado");
  }

  private async applyCloudPayment(operation: CloudOperation) {
    const ticketId = String(operation.payload.ticketId ?? "").trim();
    const providerReference = String(operation.payload.providerReference ?? "").trim();
    const amount = Number(operation.payload.amount);
    const currency = String(operation.payload.currency ?? "MXN").toUpperCase();
    if (!ticketId || !providerReference || !Number.isFinite(amount) || amount <= 0) {
      throw CustomError.badRequest("Pago cloud invalido");
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const existingPayment = await PaymentModel.findOne({ providerReference }).session(session);
        if (existingPayment) return;
        const ticket = await TicketModel.findById(ticketId).session(session);
        if (!ticket || String(ticket.get("usuario")) !== operation.userId) {
          throw CustomError.notFound("Ticket no encontrado");
        }
        if (ticket.get("pagado") === true) {
          throw CustomError.conflict("El ticket ya fue pagado");
        }
        if (Number(ticket.get("monto")) !== amount) {
          throw CustomError.conflict("El monto confirmado no coincide con la cotizacion local");
        }
        const paidAt = Number(operation.payload.paidAt) || Date.now();
        await PaymentModel.create([{
          user: operation.userId,
          type: "ticket",
          concept: "Pago de ticket desde Viggo App",
          amount,
          currency,
          status: "succeeded",
          paidAt,
          providerReference,
          reference: { type: "ticket", id: ticketId },
          parking: { id: operation.proyectoId },
          rawProviderStatus: "succeeded",
        }], { session });
        ticket.set({ pagado: true, horaCobro: paidAt });
        await ticket.save({ session });
      });
    } finally {
      await session.endSession();
    }
    const ticket = await this.ticketService.getTicketById(ticketId);
    return { ticket: await this.ticketService.toLegacyTicketResponse(ticket) };
  }

  private complete(operationId: string, payload: Record<string, unknown>) {
    return this.cloudFetch(`/api/sync/mobile-commands/${encodeURIComponent(operationId)}/complete`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  private async cloudFetch(path: string, init: RequestInit = {}) {
    return fetch(`${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.syncToken || envs.SYNC_SERVICE_TOKEN}`,
        "X-Viggo-Installation-Id": await InstallationIdentityService.getInstallationId(),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }
}
