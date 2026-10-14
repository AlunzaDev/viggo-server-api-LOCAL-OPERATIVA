import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import type { PermissionProfile as PermissionProfileRow, UserApp, UserModule } from "../../../generated/prisma/client";
import { PermissionProfileDatasource } from "../../../domain/datasources/auth/permission-profile.datasource";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { isUuid } from "../postgres/prisma-errors";

export const toPermissionProfileEntity = (row: PermissionProfileRow): PermissionProfileEntity =>
  PermissionProfileEntity.fromObject({
    id: row.id,
    app: row.app,
    nombre: row.nombre,
    descripcion: row.descripcion,
    modules: row.modules,
    estado: row.estado,
  });

/** All columns of a profile (they all come from the cloud). */
export const permissionProfileColumns = (profile: Omit<PermissionProfileEntity, "id">) => ({
  app: profile.app as UserApp,
  nombre: profile.nombre,
  descripcion: profile.descripcion ?? "",
  modules: profile.modules as UserModule[],
  estado: profile.estado,
});

const toData = (profile: Partial<Omit<PermissionProfileEntity, "id">>) => ({
  ...(profile.app !== undefined ? { app: profile.app as UserApp } : {}),
  ...(profile.nombre !== undefined ? { nombre: profile.nombre } : {}),
  ...(profile.descripcion !== undefined ? { descripcion: profile.descripcion ?? "" } : {}),
  ...(profile.modules !== undefined ? { modules: profile.modules as UserModule[] } : {}),
  ...(profile.estado !== undefined ? { estado: profile.estado } : {}),
});

/** Profiles are synced from ADMINISTRATIVO; ids come from the cloud. */
export class PermissionProfilePostgresDatasource extends PermissionProfileDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async create(profile: Omit<PermissionProfileEntity, "id">): Promise<PermissionProfileEntity> {
    const row = await this.db.permissionProfile.create({
      data: { id: randomUUID(), ...permissionProfileColumns(profile) },
    });
    return toPermissionProfileEntity(row);
  }

  async getAll(): Promise<PermissionProfileEntity[]> {
    const rows = await this.db.permissionProfile.findMany({ orderBy: [{ nombre: "asc" }, { id: "asc" }] });
    return rows.map(toPermissionProfileEntity);
  }

  async findById(id: string): Promise<PermissionProfileEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.permissionProfile.findUnique({ where: { id } });
    return row ? toPermissionProfileEntity(row) : null;
  }

  async upsert(profile: PermissionProfileEntity): Promise<PermissionProfileEntity> {
    if (!isUuid(profile.id)) {
      throw new Error(`Invalid permission profile id "${profile.id}": profiles come from ADMINISTRATIVO with UUID ids.`);
    }
    const { id, ...values } = profile;
    const data = permissionProfileColumns(values);
    const row = await this.db.permissionProfile.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    return toPermissionProfileEntity(row);
  }

  async findByNombre(nombre: string): Promise<PermissionProfileEntity | null> {
    const row = await this.db.permissionProfile.findFirst({ where: { nombre }, orderBy: { updatedAt: "desc" } });
    return row ? toPermissionProfileEntity(row) : null;
  }

  async update(
    id: string,
    profile: Partial<Omit<PermissionProfileEntity, "id">>,
  ): Promise<PermissionProfileEntity | null> {
    if (!isUuid(id)) return null;
    const result = await this.db.permissionProfile.updateMany({ where: { id }, data: toData(profile) });
    return result.count ? this.findById(id) : null;
  }

  async delete(id: string): Promise<PermissionProfileEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.db.permissionProfile.delete({ where: { id } });
    return existing;
  }
}
