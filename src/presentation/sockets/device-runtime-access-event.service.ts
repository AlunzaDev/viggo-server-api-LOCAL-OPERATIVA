import { Socket } from "socket.io";
import { TicketRepository } from "../../domain/repositories/parking/ticket.repository";
import { buildOperationalLogsService } from "../dependencies/operational-logs.dependencies";
import {
  DeviceRuntimeAccessEventPayload,
  OpenBarrierResponse,
} from "./device-socket.types";
import { buildRuntimeAccessTicketPatch } from "./device-runtime-access-event.helpers";

const operationalLogsService = buildOperationalLogsService();

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

      const patch = buildRuntimeAccessTicketPatch(ticket, normalizedPayload);
      await this.ticketRepository.update(ticket.id, patch);
      await this.logRuntimeEvent(normalizedPayload, ticket.proyecto, moduloId);

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

  private async logRuntimeEvent(
    payload: DeviceRuntimeAccessEventPayload,
    projectId: string,
    moduloId: string,
  ) {
    if (payload.event === "barrier_opened") {
      await operationalLogsService.logEvent({
        scope: "access_flow",
        type: "barrier_opened",
        severity: "info",
        projectId,
        moduloId,
        ticketId: payload.ticketId,
        flowId: payload.ticketId,
        source: "device",
        message: "El dispositivo reporto que la barrera se abrio.",
        metadata: {
          mode: payload.mode,
          occurredAt: payload.occurredAt,
        },
      });
      return;
    }

    if (payload.event === "vehicle_passed") {
      await operationalLogsService.logEvent({
        scope: "access_flow",
        type: "vehicle_passed",
        severity: "info",
        projectId,
        moduloId,
        ticketId: payload.ticketId,
        flowId: payload.ticketId,
        source: "device",
        message: "El dispositivo confirmo el paso del vehiculo por el segundo lazo.",
        metadata: {
          mode: payload.mode,
          occurredAt: payload.occurredAt,
        },
      });
      return;
    }

    await operationalLogsService.logIncident({
      scope: "access_flow",
      type: "exit_loop_missing",
      severity: "critical",
      projectId,
      moduloId,
      ticketId: payload.ticketId,
      flowId: payload.ticketId,
      source: "device",
      message: "Se abrio la barrera, pero no se confirmo el paso por el segundo lazo.",
      metadata: {
        mode: payload.mode,
        occurredAt: payload.occurredAt,
      },
    });
    await operationalLogsService.logIncident({
      scope: "access_flow",
      type: "ticket_fraud_suspected",
      severity: "critical",
      projectId,
      moduloId,
      ticketId: payload.ticketId,
      flowId: payload.ticketId,
      source: "system",
      message: "El boleto quedo marcado como posible fraude por falta de confirmacion del segundo lazo.",
      metadata: {
        mode: payload.mode,
        occurredAt: payload.occurredAt,
      },
    });
  }
}
