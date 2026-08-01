import { Socket } from "socket.io";
import { TicketRepository } from "../../domain/repository/parking/ticket.repository";
import {
  DeviceRuntimeAccessEventPayload,
  OpenBarrierResponse,
} from "./device-socket.types";

export class DeviceRuntimeAccessEventService {
  constructor(private readonly ticketRepository: TicketRepository) {}

  async handleRuntimeAccessEvent(
    socket: Socket,
    payload: DeviceRuntimeAccessEventPayload,
    callback?: (response: OpenBarrierResponse) => void,
  ): Promise<void> {
    try {
      if (!Boolean(socket.data.deviceApproved)) {
        callback?.({
          ok: false,
          error: "Dispositivo no autorizado",
          code: "DEVICE_NOT_APPROVED",
        });
        return;
      }

      const moduloId =
        typeof socket.data.moduloId === "string" ? socket.data.moduloId : "";
      const normalizedPayload = this.normalizePayload(payload);

      if (!normalizedPayload) {
        callback?.({
          ok: false,
          error: "Payload de acceso invalido",
          code: "INVALID_RUNTIME_ACCESS_EVENT",
        });
        return;
      }

      if (moduloId && normalizedPayload.moduleId !== moduloId) {
        callback?.({
          ok: false,
          error: "El modulo del evento no coincide con la sesion",
          code: "RUNTIME_ACCESS_MODULE_MISMATCH",
        });
        return;
      }

      const ticket = await this.ticketRepository.findById(
        normalizedPayload.ticketId,
      );

      if (!ticket) {
        callback?.({
          ok: false,
          error: "Ticket no encontrado",
          code: "RUNTIME_ACCESS_TICKET_NOT_FOUND",
        });
        return;
      }

      const patch = this.buildTicketPatch(ticket, normalizedPayload);
      await this.ticketRepository.update(ticket.id, patch);

      callback?.({ ok: true });
    } catch (error) {
      callback?.({
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo registrar el acceso",
        code: "RUNTIME_ACCESS_EVENT_FAILED",
      });
    }
  }

  private normalizePayload(
    payload: DeviceRuntimeAccessEventPayload,
  ): DeviceRuntimeAccessEventPayload | null {
    const ticketId = String(payload?.ticketId ?? "").trim();
    const moduleId = String(payload?.moduleId ?? "").trim();
    const kind = payload?.kind === "ticket" ? "ticket" : "";
    const event = String(payload?.event ?? "").trim();
    const occurredAt = Number(payload?.occurredAt ?? 0);
    const mode = payload?.mode === "salida" ? "salida" : "entrada";

    if (
      kind !== "ticket" ||
      !ticketId ||
      !moduleId ||
      !Number.isFinite(occurredAt) ||
      !["barrier_opened", "vehicle_passed", "vehicle_timeout"].includes(event)
    ) {
      return null;
    }

    return {
      kind,
      ticketId,
      moduleId,
      mode,
      event: event as DeviceRuntimeAccessEventPayload["event"],
      occurredAt,
    };
  }

  private buildTicketPatch(
    ticket: Awaited<ReturnType<TicketRepository["findById"]>> & { id: string },
    payload: DeviceRuntimeAccessEventPayload,
  ) {
    if (payload.event === "barrier_opened") {
      return {
        barrierOpenedAt: payload.occurredAt,
      };
    }

    if (payload.event === "vehicle_passed") {
      return {
        barrierConfirmedAt: payload.occurredAt,
        status: ticket.horaSalida !== -1 ? "COMPLETED" : ticket.status,
        fraudDetectedAt: -1,
        fraudReason: "",
      };
    }

    return {
      status: "FRAUD" as const,
      fraudDetectedAt: payload.occurredAt,
      fraudReason:
        "Se abrio la barrera, pero no se confirmo el paso por el segundo lazo.",
    };
  }
}
