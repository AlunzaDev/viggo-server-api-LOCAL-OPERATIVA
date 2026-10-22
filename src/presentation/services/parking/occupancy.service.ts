import { TICKET_MAX_STAY_MS } from "../../../domain/datasources/parking/occupancy.datasource";
import { DEFAULT_TIME_ZONE } from "../../../domain/entities/parking/time-zone";
import { CustomError } from "../../../domain/errors/custom.error";
import type { OccupancyRepository } from "../../../domain/repositories/parking/occupancy.repository";
import type { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";

/** Open tickets listed (the oldest ones, the ones worth checking). */
const OPEN_TICKETS_LIMIT = 100;

/**
 * How full this installation's parking is: now, by hour today, and who is inside
 * (AlunzaDev/viggo-server-api-LOCAL-OPERATIVA#20).
 */
export class OccupancyService {
  constructor(
    private readonly occupancy: OccupancyRepository,
    private readonly proyectos: ProyectoRepository,
  ) {}

  async get(proyectoId: string, now = Date.now()) {
    const proyecto = await this.proyectos.findById(proyectoId);
    if (!proyecto) throw CustomError.notFound("Proyecto no encontrado");
    const zone = proyecto.zonaHoraria ?? DEFAULT_TIME_ZONE;
    const capacidad = proyecto.capacidad ?? null;

    const [inside, hours, open, pensioners] = await Promise.all([
      this.occupancy.insideNow(proyectoId, now),
      this.occupancy.todayByHour(proyectoId, zone, now),
      this.occupancy.openTickets(proyectoId, OPEN_TICKETS_LIMIT),
      this.occupancy.pensionersInside(proyectoId),
    ]);
    const autosDentro = inside.tickets + inside.pensionados;
    const forgottenBefore = now - TICKET_MAX_STAY_MS;
    return {
      generadoEn: now,
      zonaHoraria: zone,
      ahora: {
        autosDentro,
        tickets: inside.tickets,
        pensionados: inside.pensionados,
        capacidad,
        // Without a captured capacity there is no percentage, never a made-up one.
        porcentaje: capacidad ? Math.round((autosDentro / capacidad) * 1000) / 10 : null,
        lugaresLibres: capacidad ? Math.max(0, capacidad - autosDentro) : null,
      },
      hoy: { horas: hours },
      ticketsAbiertos: {
        total: open.total,
        items: open.items.map((ticket) => ({
          ...ticket,
          minutosDentro: Math.max(0, Math.floor((now - ticket.horaInicio) / 60_000)),
          // More than 7 days without exit: no longer counted as inside, probably never closed.
          olvidado: ticket.horaInicio <= forgottenBefore,
        })),
      },
      pensionadosDentro: { total: pensioners.length, items: pensioners },
    };
  }
}
