import { PENSION_MAX_STAY_MS } from "@alunzadev/viggo-contracts";
import { PostgresDatabase } from "../../../data/postgres";
import { Prisma } from "../../../generated/prisma/client";
import { OccupancyDatasource, TICKET_MAX_STAY_MS } from "../../../domain/datasources/parking/occupancy.datasource";
import { isUuid } from "../postgres/prisma-errors";

/** Longest a pensioner without moves counts as inside, for the hours of today (as in ADMINISTRATIVO). */
const PENSION_MAX_STAY = Prisma.sql`(${PENSION_MAX_STAY_MS} * interval '1 millisecond')`;
const ticketMaxStay = Prisma.sql`(${TICKET_MAX_STAY_MS} * interval '1 millisecond')`;

export class OccupancyPostgresDatasource extends OccupancyDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async insideNow(proyectoId: string, now: number) {
    if (!isUuid(proyectoId)) return { tickets: 0, pensionados: 0 };
    const at = new Date(now);
    const [row] = await this.db.$queryRaw<Array<{ tickets: number; pensionados: number }>>(Prisma.sql`
      SELECT
        (SELECT count(*)::int FROM tickets t
          WHERE t.proyecto_id = ${proyectoId}::uuid AND t.hora_inicio <= ${at} AND t.hora_inicio > ${at}::timestamptz - ${ticketMaxStay}
            AND (t.hora_salida > ${at} OR (t.hora_salida IS NULL AND t.status <> 'FRAUD'))) AS tickets,
        (SELECT count(*)::int FROM pension_passes pp JOIN pensiones pe ON pe.id = pp.pension_id
          WHERE pe.proyecto_id = ${proyectoId}::uuid AND pp.in_parking AND pp.estado) AS pensionados`);
    return row;
  }

  async todayByHour(proyectoId: string, zone: string, now: number) {
    if (!isUuid(proyectoId)) return [];
    const at = new Date(now);
    // The pensioners of each past hour come from their moves: whose last move before it was an
    // entry (within 30 days). The flag only tells who is inside now.
    return this.db.$queryRaw<Array<{ hora: string; dentro: number; entradas: number; salidas: number }>>(Prisma.sql`
      WITH hours AS (
        SELECT to_char(local, 'HH24') || ':00' AS hora, local AT TIME ZONE ${zone} AS h
        FROM generate_series(date_trunc('day', ${at}::timestamptz AT TIME ZONE ${zone}),
          date_trunc('hour', ${at}::timestamptz AT TIME ZONE ${zone}), interval '1 hour') AS local
      )
      SELECT hours.hora,
        (SELECT count(*)::int FROM tickets t
          WHERE t.proyecto_id = ${proyectoId}::uuid AND t.hora_inicio <= hours.h AND t.hora_inicio > hours.h - ${ticketMaxStay}
            AND (t.hora_salida > hours.h OR (t.hora_salida IS NULL AND t.status <> 'FRAUD')))
        + (SELECT count(*)::int FROM (
            SELECT DISTINCT ON (m.pension_pass_id) m.tipo FROM pension_moves m
            WHERE m.proyecto_id = ${proyectoId}::uuid AND m.fecha <= hours.h AND m.fecha > hours.h - ${PENSION_MAX_STAY}
            ORDER BY m.pension_pass_id, m.fecha DESC
          ) last WHERE last.tipo::text LIKE 'ENTRADA%') AS dentro,
        (SELECT count(*)::int FROM tickets t
          WHERE t.proyecto_id = ${proyectoId}::uuid AND t.hora_inicio >= hours.h AND t.hora_inicio < hours.h + interval '1 hour')
        + (SELECT count(*)::int FROM pension_moves m
          WHERE m.proyecto_id = ${proyectoId}::uuid AND m.tipo::text LIKE 'ENTRADA%' AND m.fecha >= hours.h AND m.fecha < hours.h + interval '1 hour') AS entradas,
        (SELECT count(*)::int FROM tickets t
          WHERE t.proyecto_id = ${proyectoId}::uuid AND t.hora_salida >= hours.h AND t.hora_salida < hours.h + interval '1 hour')
        + (SELECT count(*)::int FROM pension_moves m
          WHERE m.proyecto_id = ${proyectoId}::uuid AND m.tipo::text LIKE 'SALIDA%' AND m.fecha >= hours.h AND m.fecha < hours.h + interval '1 hour') AS salidas
      FROM hours ORDER BY hours.h`);
  }

  async openTickets(proyectoId: string, limit: number) {
    if (!isUuid(proyectoId)) return { total: 0, items: [] };
    const where = Prisma.sql`proyecto_id = ${proyectoId}::uuid AND hora_salida IS NULL AND status <> 'FRAUD'`;
    const [{ total }] = await this.db.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT count(*)::int AS total FROM tickets WHERE ${where}`);
    const rows = await this.db.$queryRaw<Array<{ id: string; id_boleto: string; hora_inicio: Date; pagado: boolean; monto: string }>>(Prisma.sql`
      SELECT id::text, id_boleto, hora_inicio, pagado, monto::text FROM tickets WHERE ${where}
      ORDER BY hora_inicio ASC, id ASC LIMIT ${limit}`);
    return {
      total,
      items: rows.map((row) => ({ id: row.id, idBoleto: row.id_boleto, horaInicio: row.hora_inicio.getTime(), pagado: row.pagado, monto: Number(row.monto) })),
    };
  }

  async pensionersInside(proyectoId: string) {
    if (!isUuid(proyectoId)) return [];
    const rows = await this.db.$queryRaw<Array<{ id: string; id_pass: string; name: string; titular: string | null; pension: string; desde: Date | null }>>(Prisma.sql`
      SELECT pp.id::text, pp.id_pass, pp.name, NULLIF(trim(concat_ws(' ', u.nombre, u.apellido)), '') AS titular, pe.nombre AS pension, last.fecha AS desde
      FROM pension_passes pp
      JOIN pensiones pe ON pe.id = pp.pension_id
      LEFT JOIN usuarios u ON u.id = pp.usuario_id
      LEFT JOIN LATERAL (
        SELECT m.fecha FROM pension_moves m
        WHERE m.pension_pass_id = pp.id AND m.tipo::text LIKE 'ENTRADA%' ORDER BY m.fecha DESC LIMIT 1
      ) last ON true
      WHERE pe.proyecto_id = ${proyectoId}::uuid AND pp.in_parking AND pp.estado
      ORDER BY last.fecha ASC NULLS FIRST, pp.name ASC`);
    return rows.map((row) => ({
      pensionPassId: row.id, idPass: row.id_pass, nombre: row.name, titular: row.titular, pension: row.pension, desde: row.desde?.getTime() ?? null,
    }));
  }
}
