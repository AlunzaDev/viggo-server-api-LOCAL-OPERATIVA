import type { InsideNow, OccupancyHour, OpenTicket, PensionerInside } from "../../datasources/parking/occupancy.datasource";

export abstract class OccupancyRepository {
  abstract insideNow(proyectoId: string, now: number): Promise<InsideNow>;
  abstract todayByHour(proyectoId: string, zone: string, now: number): Promise<OccupancyHour[]>;
  abstract openTickets(proyectoId: string, limit: number): Promise<{ total: number; items: OpenTicket[] }>;
  abstract pensionersInside(proyectoId: string): Promise<PensionerInside[]>;
}
