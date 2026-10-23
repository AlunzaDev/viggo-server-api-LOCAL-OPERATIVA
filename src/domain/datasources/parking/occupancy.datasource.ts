/**
 * Who is inside the parking, read from OPERATIVO's own records (it is the authority of the
 * physical operation: no need for the cloud to be up to date).
 *
 * A ticket is inside while it has no exit, as in ADMINISTRATIVO's statistics: entry in the last
 * 7 days (older ones are taken as forgotten) and not marked as fraud. A pensioner is inside
 * when its pass is marked in_parking (the anti-passback flag).
 */

/** Longest a ticket without exit counts as inside (shared rule, @alunzadev/viggo-contracts). */
export { TICKET_MAX_STAY_MS } from "@alunzadev/viggo-contracts";

export interface InsideNow {
  tickets: number;
  pensionados: number;
}

/** One local hour of today. */
export interface OccupancyHour {
  /** Local hour, "08:00". */
  hora: string;
  /** Cars inside at the start of the hour (tickets and pensioners). */
  dentro: number;
  /** Entries and exits during the hour (tickets and pensioners). */
  entradas: number;
  salidas: number;
}

export interface OpenTicket {
  id: string;
  idBoleto: string;
  horaInicio: number;
  pagado: boolean;
  monto: number;
}

export interface PensionerInside {
  pensionPassId: string;
  idPass: string;
  nombre: string;
  titular: string | null;
  pension: string;
  /** Its last entry, if one was recorded. */
  desde: number | null;
}

export abstract class OccupancyDatasource {
  abstract insideNow(proyectoId: string, now: number): Promise<InsideNow>;
  /** Every local hour of today up to the current one, in the parking's time zone. */
  abstract todayByHour(proyectoId: string, zone: string, now: number): Promise<OccupancyHour[]>;
  /** Tickets without exit (not fraud), oldest first: how many, and the first `limit`. */
  abstract openTickets(proyectoId: string, limit: number): Promise<{ total: number; items: OpenTicket[] }>;
  abstract pensionersInside(proyectoId: string): Promise<PensionerInside[]>;
}
