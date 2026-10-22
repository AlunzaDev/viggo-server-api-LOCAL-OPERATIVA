import type { OccupancyDatasource } from "../../../domain/datasources/parking/occupancy.datasource";
import { OccupancyRepository } from "../../../domain/repositories/parking/occupancy.repository";

export class OccupancyRepositoryImpl implements OccupancyRepository {
  constructor(private readonly datasource: OccupancyDatasource) {}

  insideNow(proyectoId: string, now: number) {
    return this.datasource.insideNow(proyectoId, now);
  }

  todayByHour(proyectoId: string, zone: string, now: number) {
    return this.datasource.todayByHour(proyectoId, zone, now);
  }

  openTickets(proyectoId: string, limit: number) {
    return this.datasource.openTickets(proyectoId, limit);
  }

  pensionersInside(proyectoId: string) {
    return this.datasource.pensionersInside(proyectoId);
  }
}
