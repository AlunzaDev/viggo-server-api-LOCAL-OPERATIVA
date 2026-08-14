import { CustomError } from "../../domain/errors/custom.error";
import type { TicketEntity } from "../../domain/entities/parking/ticket.entity";
import type { DeviceRuntimeAccessEventPayload } from "./device-socket.types";

type TicketPatch = {
  barrierOpenedAt?: number;
  barrierConfirmedAt?: number;
  fraudDetectedAt?: number;
  fraudReason?: string;
  status?: "ACTIVE" | "COMPLETED" | "FRAUD";
  runtimeEventIds?: string[];
};

const isFiniteTimestamp = (value: number) => Number.isFinite(value) && value > 0;

export const buildRuntimeAccessTicketPatch = (
  ticket: TicketEntity,
  payload: DeviceRuntimeAccessEventPayload,
): TicketPatch => {
  if (!isFiniteTimestamp(payload.occurredAt)) {
    throw CustomError.badRequest(
      "El evento del dispositivo no trae una fecha valida",
      { occurredAt: payload.occurredAt, event: payload.event, ticketId: payload.ticketId },
      "INVALID_RUNTIME_ACCESS_TIMESTAMP",
    );
  }

  if (payload.event === "barrier_opened") {
    if (ticket.status === "COMPLETED") {
      throw CustomError.badRequest(
        "El ticket ya fue completado y no puede volver a abrir barrera",
        { ticketId: ticket.id, status: ticket.status },
        "RUNTIME_ACCESS_ALREADY_COMPLETED",
      );
    }

    return {
      barrierOpenedAt: payload.occurredAt,
      fraudDetectedAt: -1,
      fraudReason: "",
      status: ticket.status === "FRAUD" ? "ACTIVE" : ticket.status,
    };
  }

  if (ticket.barrierOpenedAt <= 0) {
    throw CustomError.badRequest(
      "El dispositivo reporto un paso sin apertura previa de barrera",
      {
        ticketId: ticket.id,
        event: payload.event,
        barrierOpenedAt: ticket.barrierOpenedAt,
      },
      "RUNTIME_ACCESS_BARRIER_NOT_OPENED",
    );
  }

  if (payload.occurredAt < ticket.barrierOpenedAt) {
    throw CustomError.badRequest(
      "El evento del dispositivo llego con una fecha anterior a la apertura de barrera",
      {
        ticketId: ticket.id,
        event: payload.event,
        occurredAt: payload.occurredAt,
        barrierOpenedAt: ticket.barrierOpenedAt,
      },
      "RUNTIME_ACCESS_OUT_OF_ORDER",
    );
  }

  if (payload.event === "vehicle_passed") {
    if (ticket.barrierConfirmedAt > 0) {
      return {};
    }

    return {
      barrierConfirmedAt: payload.occurredAt,
      status: payload.mode === "salida" ? "COMPLETED" : ticket.status,
      fraudDetectedAt: -1,
      fraudReason: "",
    };
  }

  if (ticket.barrierConfirmedAt > 0 || ticket.status === "COMPLETED") {
    return {};
  }

  return {
    status: "FRAUD",
    fraudDetectedAt: payload.occurredAt,
    fraudReason:
      "Se abrio la barrera, pero no se confirmo el paso por el segundo lazo.",
  };
};
