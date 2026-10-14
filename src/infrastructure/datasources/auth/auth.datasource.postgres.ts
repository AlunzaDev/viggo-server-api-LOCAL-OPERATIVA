import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import {
  AuthDatasource,
  type LocalUserList,
  type LocalUserSummary,
  type UserSyncMetadata,
} from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { isUuid, toEpochMs } from "../postgres/prisma-errors";
import { toUsuarioEntity, usuarioInclude, writeUsuario, type UsuarioLocalData } from "./usuario.prisma-mapper";

const toLocalUserSummary = (user: UsuarioEntity): LocalUserSummary => ({
  id: user.id,
  nombre: user.nombre,
  apellido: user.apellido,
  correo: user.correo,
  telefono: user.telefono,
  rol: user.rol,
  estado: user.estado,
  parkings: [...user.parkings],
  allowedApps: [...user.allowedApps],
  appPermissions: user.appPermissions.map((permission) => ({ ...permission })),
});

export class AuthPostgresDatasource extends AuthDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  // correo/telefono are not unique locally (the cloud owns them); the freshest copy wins.
  async findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    const row = await this.db.usuario.findFirst({
      where: { correo: correo.trim().toLowerCase() },
      include: usuarioInclude,
      orderBy: { updatedAt: "desc" },
    });
    return row ? toUsuarioEntity(row) : null;
  }

  async findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    const row = await this.db.usuario.findFirst({
      where: { telefono },
      include: usuarioInclude,
      orderBy: { updatedAt: "desc" },
    });
    return row ? toUsuarioEntity(row) : null;
  }

  async findById(id: string): Promise<UsuarioEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.usuario.findUnique({ where: { id }, include: usuarioInclude });
    return row ? toUsuarioEntity(row) : null;
  }

  async updateBarrierBlasterHighScore(id: string, score: number): Promise<UsuarioEntity | null> {
    if (!isUuid(id)) return null;
    // Only raises the score (was $max).
    await this.db.usuario.updateMany({
      where: { id, barrierBlasterHighScore: { lt: score } },
      data: { barrierBlasterHighScore: score },
    });
    return this.findById(id);
  }

  upsert(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    return this.save(usuario, {
      barrierBlasterHighScore: usuario.barrierBlasterHighScore,
    });
  }

  upsertFromAdministrativo(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    const now = new Date();
    // The local high score is kept: the cloud does not know it.
    return this.save(usuario, {
      syncSource: "administrativo",
      lastSyncedAt: now,
      lastCloudCheckAt: now,
    });
  }

  async getSyncMetadataById(id: string): Promise<UserSyncMetadata | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.usuario.findUnique({
      where: { id },
      select: { syncSource: true, lastSyncedAt: true, lastCloudCheckAt: true },
    });
    if (!row) return null;
    return {
      syncSource: row.syncSource === "local" ? "local" : "administrativo",
      lastSyncedAt: toEpochMs(row.lastSyncedAt),
      lastCloudCheckAt: toEpochMs(row.lastCloudCheckAt),
    };
  }

  async listLocalUsers(options: { page: number; limit: number; search?: string }): Promise<LocalUserList> {
    const search = options.search?.trim();
    const where: Prisma.UsuarioWhereInput = search
      ? {
          OR: (["nombre", "apellido", "correo", "telefono"] as const).map((field) => ({
            [field]: { contains: search, mode: "insensitive" },
          })),
        }
      : {};
    const [rows, total] = await Promise.all([
      this.db.usuario.findMany({
        where,
        include: usuarioInclude,
        orderBy: [{ nombre: "asc" }, { apellido: "asc" }, { id: "asc" }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.db.usuario.count({ where }),
    ]);
    return {
      usuarios: rows.map((row) => toLocalUserSummary(toUsuarioEntity(row))),
      total,
      page: options.page,
      limit: options.limit,
    };
  }

  async findLocalUserSummaryById(id: string): Promise<LocalUserSummary | null> {
    const user = await this.findById(id);
    return user ? toLocalUserSummary(user) : null;
  }

  /** Creates or replaces the user and its app permissions in one transaction. */
  private async save(usuario: UsuarioEntity, localData: UsuarioLocalData): Promise<UsuarioEntity> {
    const row = await this.db.$transaction(async (tx) => {
      await writeUsuario(tx, usuario, localData);
      return tx.usuario.findUniqueOrThrow({ where: { id: usuario.id }, include: usuarioInclude });
    });
    return toUsuarioEntity(row);
  }
}
