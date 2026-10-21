import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import type { ModuloTipo, Prisma } from "../../../generated/prisma/client";
import { ModuloDatasource, type ModuloFilters } from "../../../domain/datasources/parking/modulo.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import {
  ModuloEntity,
  type ModuloCreateValues,
  type ModuloSubmodulo,
  type ModuloUpdateValues,
} from "../../../domain/entities/parking/modulo.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { MODULO_KEYS, moduloInclude, toModuloEntity, writeModulo } from "./parking.prisma-mapper";

const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * Module configuration is a projection of ADMINISTRATIVO; the device state
 * (binding, requests, connection audit, runtime) is owned by this server.
 */
export class ModuloPostgresDatasource extends ModuloDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  private async findMany(where: Prisma.ModuloWhereInput): Promise<ModuloEntity[]> {
    const rows = await this.db.modulo.findMany({ where, include: moduloInclude, orderBy: order });
    return rows.map(toModuloEntity);
  }

  async create(modulo: ModuloCreateValues): Promise<ModuloEntity> {
    const id = randomUUID();
    await withPrismaErrors(
      () => this.db.$transaction((tx) => writeModulo(tx, id, modulo, { create: true, replace: MODULO_KEYS })),
      { foreignKey: CustomError.badRequest("El proyecto del modulo no existe") },
    );
    return (await this.findById(id))!;
  }

  async findById(id: string): Promise<ModuloEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.modulo.findUnique({ where: { id }, include: moduloInclude });
    return row ? toModuloEntity(row) : null;
  }

  async findByIdentificador(identificador: string): Promise<ModuloEntity | null> {
    const row = await this.db.modulo.findFirst({ where: { identificador }, include: moduloInclude, orderBy: order });
    return row ? toModuloEntity(row) : null;
  }

  getAll(): Promise<ModuloEntity[]> {
    return this.findMany({});
  }

  getWithPendingDeviceBindingRequests(): Promise<ModuloEntity[]> {
    return this.findMany({ bindingRequests: { some: { status: "PENDING" } } });
  }

  getFiltered(filters: ModuloFilters): Promise<ModuloEntity[]> {
    if (filters.proyecto !== undefined && !isUuid(filters.proyecto)) return Promise.resolve([]);
    const proyectos = filters.proyectos?.filter(isUuid);
    if (proyectos && !proyectos.length) return Promise.resolve([]);
    return this.findMany({
      AND: [
        filters.proyecto ? { proyectoId: filters.proyecto } : {},
        proyectos ? { proyectoId: { in: proyectos } } : {},
      ],
      ...(filters.tipos?.length ? { tipo: { in: filters.tipos as ModuloTipo[] } } : {}),
      ...(typeof filters.estado === "boolean" ? { estado: filters.estado } : {}),
    });
  }

  getByProyecto(proyectoId: string): Promise<ModuloEntity[]> {
    if (!isUuid(proyectoId)) return Promise.resolve([]);
    return this.findMany({ proyectoId });
  }

  async getSubmodulos(id: string): Promise<ModuloSubmodulo[] | null> {
    const modulo = await this.findById(id);
    return modulo ? modulo.submodulos : null;
  }

  async update(id: string, modulo: ModuloUpdateValues): Promise<ModuloEntity | null> {
    if (!isUuid(id) || !(await this.db.modulo.count({ where: { id } }))) return null;
    await withPrismaErrors(
      () => this.db.$transaction((tx) => writeModulo(tx, id, modulo, { create: false })),
      { foreignKey: CustomError.badRequest("El proyecto del modulo no existe") },
    );
    return this.findById(id);
  }

  async resetDeviceBinding(id: string): Promise<ModuloEntity | null> {
    if (!isUuid(id)) return null;
    await this.db.moduloDeviceBinding.deleteMany({ where: { moduloId: id } });
    return this.findById(id);
  }

  async delete(id: string): Promise<ModuloEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await withPrismaErrors(() => this.db.modulo.delete({ where: { id } }), {
      foreignKey: CustomError.conflict("El modulo tiene tickets, turnos o movimientos locales"),
    });
    return existing;
  }
}
