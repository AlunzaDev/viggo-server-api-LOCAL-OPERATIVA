import { PostgresDatabase } from "../../../data/postgres";
import { Prisma, type ParkingRate as ParkingRateRow } from "../../../generated/prisma/client";
import { ParkingRateDatasource } from "../../../domain/datasources/parking/parking-rate.datasource";
import { validateParkingRate, type ParkingRate, type ParkingRateRules } from "../../../domain/entities/parking/parking-rate.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";

const toParkingRate = (row: ParkingRateRow): ParkingRate => ({
  id: row.id,
  proyectoId: row.proyectoId,
  version: row.version,
  toleranceMinutes: row.toleranceMinutes,
  firstBlockMinutes: row.firstBlockMinutes,
  firstBlockPrice: row.firstBlockPrice.toNumber(),
  fractionMinutes: row.fractionMinutes,
  fractionPrice: row.fractionPrice.toNumber(),
  dailyMax: row.dailyMax === null ? null : row.dailyMax.toNumber(),
  createdBy: row.createdBy,
  createdAt: row.createdAt.getTime(),
});

export class ParkingRatePostgresDatasource extends ParkingRateDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async findCurrent(proyectoId: string) {
    if (!isUuid(proyectoId)) return null;
    const row = await this.db.parkingRate.findFirst({ where: { proyectoId }, orderBy: { version: "desc" } });
    return row ? toParkingRate(row) : null;
  }

  async getHistory(proyectoId: string, limit: number) {
    if (!isUuid(proyectoId)) return [];
    const rows = await this.db.parkingRate.findMany({ where: { proyectoId }, orderBy: { version: "desc" }, take: limit });
    return rows.map(toParkingRate);
  }

  async createVersion(proyectoId: string, rules: ParkingRateRules, createdBy: string) {
    const problem = validateParkingRate(rules);
    if (problem) throw CustomError.badRequest(problem);
    if (!isUuid(proyectoId)) throw CustomError.badRequest("Proyecto invalido");
    // Locking the project serializes two simultaneous saves: each gets its own version number.
    const row = await withPrismaErrors(() => this.db.$transaction(async (tx) => {
      const [project] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM proyectos WHERE id = ${proyectoId}::uuid FOR UPDATE`;
      if (!project) throw CustomError.notFound("Proyecto no encontrado");
      const latest = await tx.parkingRate.findFirst({ where: { proyectoId }, orderBy: { version: "desc" }, select: { version: true } });
      return tx.parkingRate.create({ data: {
        proyectoId,
        version: (latest?.version ?? 0) + 1,
        toleranceMinutes: rules.toleranceMinutes,
        firstBlockMinutes: rules.firstBlockMinutes,
        firstBlockPrice: new Prisma.Decimal(rules.firstBlockPrice),
        fractionMinutes: rules.fractionMinutes,
        fractionPrice: new Prisma.Decimal(rules.fractionPrice),
        dailyMax: rules.dailyMax === null ? null : new Prisma.Decimal(rules.dailyMax),
        createdBy,
      } });
    }));
    return toParkingRate(row);
  }
}
