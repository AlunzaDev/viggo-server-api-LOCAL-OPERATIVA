import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import { ProyectoDatasource } from "../../../domain/datasources/parking/proyecto.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import {
  PROYECTO_KEYS,
  proyectoInclude,
  toProyectoEntity,
  writeProyecto,
  type ProyectoValues,
} from "./parking.prisma-mapper";

const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/** The project is a projection of ADMINISTRATIVO; it is written by the config sync. */
export class ProyectoPostgresDatasource extends ProyectoDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async create(proyecto: Omit<ProyectoEntity, "id">): Promise<ProyectoEntity> {
    const id = randomUUID();
    await this.db.$transaction((tx) => writeProyecto(tx, id, proyecto, { create: true, replace: PROYECTO_KEYS }));
    return (await this.findById(id))!;
  }

  async findById(id: string): Promise<ProyectoEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.proyecto.findUnique({ where: { id }, include: proyectoInclude });
    return row ? toProyectoEntity(row) : null;
  }

  async findByIdentificador(identificador: string): Promise<ProyectoEntity | null> {
    const row = await this.db.proyecto.findFirst({ where: { identificador }, include: proyectoInclude, orderBy: order });
    return row ? toProyectoEntity(row) : null;
  }

  async getAll(): Promise<ProyectoEntity[]> {
    const rows = await this.db.proyecto.findMany({ include: proyectoInclude, orderBy: order });
    return rows.map(toProyectoEntity);
  }

  async update(id: string, proyecto: ProyectoValues): Promise<ProyectoEntity | null> {
    if (!(await this.findById(id))) return null;
    await this.db.$transaction((tx) => writeProyecto(tx, id, proyecto, { create: false }));
    return this.findById(id);
  }

  async delete(id: string): Promise<ProyectoEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await withPrismaErrors(() => this.db.proyecto.delete({ where: { id } }), {
      foreignKey: CustomError.conflict("El proyecto tiene modulos, pensiones o tickets locales"),
    });
    return existing;
  }
}
