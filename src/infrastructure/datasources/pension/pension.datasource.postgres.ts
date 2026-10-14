import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import { PensionDatasource } from "../../../domain/datasources/pension/pension.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { PensionEntity } from "../../../domain/entities/pension/pension.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { pensionInclude, toPensionEntity, writePension, type PensionValues } from "./pension.prisma-mapper";

const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/** Pensions are a projection of ADMINISTRATIVO, written by the config sync. */
export class PensionPostgresDatasource extends PensionDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async create(pension: Omit<PensionEntity, "id">): Promise<PensionEntity> {
    const id = randomUUID();
    await withPrismaErrors(() => this.db.$transaction((tx) => writePension(tx, id, pension, true)), {
      foreignKey: CustomError.badRequest("El proyecto de la pension no existe"),
    });
    return (await this.findById(id))!;
  }

  async findById(id: string): Promise<PensionEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.pension.findUnique({ where: { id }, include: pensionInclude });
    return row ? toPensionEntity(row) : null;
  }

  async getAll(): Promise<PensionEntity[]> {
    const rows = await this.db.pension.findMany({ include: pensionInclude, orderBy: order });
    return rows.map(toPensionEntity);
  }

  async getByProyecto(proyectoId: string): Promise<PensionEntity[]> {
    if (!isUuid(proyectoId)) return [];
    const rows = await this.db.pension.findMany({ where: { proyectoId }, include: pensionInclude, orderBy: order });
    return rows.map(toPensionEntity);
  }

  async update(id: string, pension: PensionValues): Promise<PensionEntity | null> {
    if (!(await this.findById(id))) return null;
    await withPrismaErrors(() => this.db.$transaction((tx) => writePension(tx, id, pension, false)), {
      foreignKey: CustomError.badRequest("El proyecto de la pension no existe"),
    });
    return this.findById(id);
  }

  async delete(id: string): Promise<PensionEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await withPrismaErrors(() => this.db.pension.delete({ where: { id } }), {
      foreignKey: CustomError.conflict("La pension tiene pension passes"),
    });
    return existing;
  }
}
