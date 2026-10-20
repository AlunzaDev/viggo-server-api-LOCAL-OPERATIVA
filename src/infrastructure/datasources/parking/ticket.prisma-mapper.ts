import { Prisma, type Ticket as TicketRow, type TicketStatus } from "../../../generated/prisma/client";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { fromEpochMsOrSentinel, toEpochMsOrSentinel } from "../postgres/prisma-errors";

export const toTicketEntity = (row: TicketRow): TicketEntity =>
  TicketEntity.fromObject({
    id: row.id,
    proyecto: row.proyectoId,
    entrada: row.entradaId,
    usuario: row.usuarioId,
    idBoleto: row.idBoleto,
    horaInicio: row.horaInicio.getTime(),
    salida: row.salidaId ?? undefined,
    horaConsulta: toEpochMsOrSentinel(row.horaConsulta),
    horaCobro: toEpochMsOrSentinel(row.horaCobro),
    horaSalida: toEpochMsOrSentinel(row.horaSalida),
    duracion: row.duracion,
    monto: row.monto.toNumber(),
    pagado: row.pagado,
    status: row.status,
    barrierOpenedAt: toEpochMsOrSentinel(row.barrierOpenedAt),
    barrierConfirmedAt: toEpochMsOrSentinel(row.barrierConfirmedAt),
    fraudDetectedAt: toEpochMsOrSentinel(row.fraudDetectedAt),
    fraudReason: row.fraudReason,
    idempotencyKey: row.idempotencyKey ?? undefined,
    exitIdempotencyKey: row.exitIdempotencyKey ?? undefined,
    runtimeEventIds: row.runtimeEventIds,
    tarifaVersion: row.tarifaVersion,
  });

export type TicketValues = Partial<Omit<TicketEntity, "id">>;

/** Columns for the given ticket values; undefined values are left alone (patch). */
export const ticketColumns = (ticket: TicketValues) => {
  const data: Prisma.TicketUncheckedUpdateInput = {};
  if (ticket.proyecto !== undefined) data.proyectoId = ticket.proyecto;
  if (ticket.entrada !== undefined) data.entradaId = ticket.entrada;
  if (ticket.usuario !== undefined) data.usuarioId = ticket.usuario;
  if (ticket.idBoleto !== undefined) data.idBoleto = ticket.idBoleto;
  if (ticket.horaInicio !== undefined) data.horaInicio = new Date(ticket.horaInicio);
  if (ticket.salida !== undefined) data.salidaId = ticket.salida || null;
  if (ticket.horaConsulta !== undefined) data.horaConsulta = fromEpochMsOrSentinel(ticket.horaConsulta);
  if (ticket.horaCobro !== undefined) data.horaCobro = fromEpochMsOrSentinel(ticket.horaCobro);
  if (ticket.horaSalida !== undefined) data.horaSalida = fromEpochMsOrSentinel(ticket.horaSalida);
  if (ticket.duracion !== undefined) data.duracion = Math.round(ticket.duracion);
  if (ticket.monto !== undefined) data.monto = new Prisma.Decimal(ticket.monto);
  if (ticket.pagado !== undefined) data.pagado = ticket.pagado;
  if (ticket.status !== undefined) data.status = ticket.status as TicketStatus;
  if (ticket.barrierOpenedAt !== undefined) data.barrierOpenedAt = fromEpochMsOrSentinel(ticket.barrierOpenedAt);
  if (ticket.barrierConfirmedAt !== undefined) data.barrierConfirmedAt = fromEpochMsOrSentinel(ticket.barrierConfirmedAt);
  if (ticket.fraudDetectedAt !== undefined) data.fraudDetectedAt = fromEpochMsOrSentinel(ticket.fraudDetectedAt);
  if (ticket.fraudReason !== undefined) data.fraudReason = ticket.fraudReason;
  if (ticket.idempotencyKey !== undefined) data.idempotencyKey = ticket.idempotencyKey || null;
  if (ticket.exitIdempotencyKey !== undefined) data.exitIdempotencyKey = ticket.exitIdempotencyKey || null;
  if (ticket.runtimeEventIds !== undefined) data.runtimeEventIds = ticket.runtimeEventIds;
  if (ticket.tarifaVersion !== undefined) data.tarifaVersion = ticket.tarifaVersion;
  return data;
};
