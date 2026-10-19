import { envs } from "../../../config";
import { CustomError } from "../../../domain/errors/custom.error";
import { buildTicketService } from "../../dependencies/parking.dependencies";
import { InstallationIdentityService } from "../installation/installation-identity.service";
import { LocalInstallationService } from "../installation/local-installation.service";
import type { TransactionRunner } from "../../../domain/datasources/system/transaction";
import type { MobileCommandRepository } from "../../../domain/repositories/mobile/mobile-command.repository";
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
  constructor(
    private readonly installations: LocalInstallationService,
    private readonly commands: MobileCommandRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async processNext() {
    const installation = await this.installations.findDefault();
    if (installation?.status !== "linked" || !installation.proyectoId) return false;
    const credentials = await InstallationIdentityService.getCloudCredentials();
    if (!credentials) return false;
    this.syncToken = credentials.token;
    const response = await this.cloudFetch("/api/sync/mobile-commands/next");
    if (response.status === 204) return false;
    const body = await response.json() as { operation?: CloudOperation };
    if (!response.ok || !body.operation) throw new Error("Comando cloud invalido");
    const operation = body.operation;

    try {
      if (operation.proyectoId !== installation.proyectoId) {
        throw CustomError.forbidden("El comando pertenece a otro proyecto");
      }
      // A re-delivered command returns the stored result instead of running again.
      let receipt = await this.commands.findReceipt(operation.operationId);
      if (!receipt) {
        const result = await this.execute(operation);
        receipt = await this.commands.saveReceipt(operation.operationId, operation.type, result);
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
      const ticket = existing ?? await this.ticketService.createTicketFromModuleToken(
        operation.userId,
        moduleToken,
        { idempotencyKey: `mobile:${operation.operationId}` },
      );
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
      const ticket = await this.ticketService.killTicketFromModuleToken(
        operation.userId,
        moduleToken,
        { idempotencyKey: `mobile:${operation.operationId}` },
      );
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

    // The payment record and the paid ticket commit together; providerReference makes it idempotent.
    await this.transactions.run(async (tx) => {
      // Reading the ticket locks it: a concurrent delivery (or cash payment) waits here and
      // then sees this payment, so a re-delivered command returns instead of failing.
      const ticket = await this.commands.findTicketById(ticketId, tx);
      if (!ticket || String(ticket.usuario) !== operation.userId) {
        throw CustomError.notFound("Ticket no encontrado");
      }
      if (await this.commands.findPaymentIdByProviderReference(providerReference, tx)) return;
      if (ticket.pagado === true) {
        throw CustomError.conflict("El ticket ya fue pagado");
      }
      if (Number(ticket.monto) !== amount) {
        throw CustomError.conflict("El monto confirmado no coincide con la cotizacion local");
      }
      const paidAt = Number(operation.payload.paidAt) || Date.now();
      await this.commands.createCloudTicketPayment(
        { user: operation.userId, ticketId, proyectoId: operation.proyectoId, amount, currency, paidAt, providerReference },
        tx,
      );
      await this.commands.markTicketPaid(ticketId, paidAt, tx);
    });
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
    const response = await fetch(`${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.syncToken}`,
        "X-Viggo-Installation-Id": await InstallationIdentityService.getInstallationId(),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    InstallationIdentityService.handleCloudResponse(response);
    return response;
  }
}
