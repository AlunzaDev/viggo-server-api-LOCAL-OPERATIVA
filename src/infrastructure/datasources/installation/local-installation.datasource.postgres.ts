import { PostgresDatabase } from "../../../data/postgres";
import type { LocalInstallation as InstallationRow, Prisma } from "../../../generated/prisma/client";
import {
  LocalInstallationDatasource,
  type LinkLocalProjectPayload,
  type LocalInstallationSyncStatePayload,
} from "../../../domain/datasources/installation/local-installation.datasource";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { PROYECTO_KEYS, proyectoInclude, toProyectoEntity, writeProyecto } from "../parking/parking.prisma-mapper";
import { isUuid } from "../postgres/prisma-errors";

const KEY = "default";

const DATE_FIELDS = ["syncTokenIssuedAt", "syncTokenRotatedAt", "requestedAt", "reviewedAt", "assignedAt", "lastSyncAt"] as const;
const TEXT_FIELDS = [
  "installationId", "proyectoId", "proyectoNombre", "proyectoIdentificador", "source", "status",
  "cloudRequestId", "encryptedSyncToken", "reviewNote", "assignedByUserId", "lastSyncStatus", "lastSyncError",
] as const;
const VERSION_FIELDS = ["lastConfigurationVersion", "lastAccessVersion"] as const;

/** Same plain shape the Mongo datasource returned (epoch ms, numbers), which callers read directly. */
const toRecord = (row: InstallationRow) => ({
  ...row,
  ...Object.fromEntries(DATE_FIELDS.map((field) => [field, row[field]?.getTime() ?? undefined])),
  lastConfigurationVersion: row.lastConfigurationVersion === null ? undefined : Number(row.lastConfigurationVersion),
  lastAccessVersion: row.lastAccessVersion === null ? undefined : Number(row.lastAccessVersion),
  lastSyncStatus: row.lastSyncStatus ?? undefined,
  updatedAt: row.updatedAt.getTime(),
});

/** Known fields of a loose payload -> columns; unknown keys are ignored. */
const toColumns = (payload: Record<string, unknown>) => {
  const data: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (payload[field] !== undefined) data[field] = payload[field] === null ? null : String(payload[field]).trim();
  }
  for (const field of DATE_FIELDS) {
    const value = payload[field];
    if (value !== undefined) data[field] = typeof value === "number" && value > 0 ? new Date(value) : null;
  }
  for (const field of VERSION_FIELDS) {
    const value = payload[field];
    if (value !== undefined) data[field] = typeof value === "number" && Number.isFinite(value) ? BigInt(value) : null;
  }
  if (data.lastSyncStatus === "") data.lastSyncStatus = null;
  return data as Prisma.LocalInstallationUncheckedUpdateInput;
};

export class LocalInstallationPostgresDatasource implements LocalInstallationDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  private async upsert(payload: Record<string, unknown>) {
    const data = toColumns(payload);
    const row = await this.db.localInstallation.upsert({
      where: { key: KEY },
      create: { ...(data as Prisma.LocalInstallationUncheckedCreateInput), key: KEY },
      update: data,
    });
    return toRecord(row);
  }

  async findDefault() {
    const row = await this.db.localInstallation.findUnique({ where: { key: KEY } });
    return row ? toRecord(row) : null;
  }

  upsertRequest(payload: Record<string, unknown>) {
    return this.upsert(payload);
  }

  /** Stores the project approved by the cloud before the first configuration sync. */
  async upsertProject(id: string, payload: Record<string, unknown>) {
    if (!isUuid(id)) throw CustomError.badRequest("El proyecto aprobado no tiene un id valido");
    const { id: _id, ...proyecto } = ProyectoEntity.fromObject({ estado: true, ...payload, id });
    const exists = (await this.db.proyecto.count({ where: { id } })) > 0;
    await this.db.$transaction((tx) => writeProyecto(tx, id, proyecto, { create: !exists, replace: PROYECTO_KEYS }));
    return this.findProjectById(id);
  }

  async findProjectById(id: string) {
    if (!isUuid(id)) return null;
    const row = await this.db.proyecto.findUnique({ where: { id }, include: proyectoInclude });
    return row ? toProyectoEntity(row) : null;
  }

  linkProject(payload: LinkLocalProjectPayload) {
    const now = Date.now();
    return this.upsert({
      proyectoId: payload.proyectoId,
      proyectoNombre: payload.proyectoNombre,
      proyectoIdentificador: payload.proyectoIdentificador,
      source: payload.source,
      status: "linked",
      cloudRequestId: payload.cloudRequestId,
      ...(payload.encryptedSyncToken
        ? { encryptedSyncToken: payload.encryptedSyncToken, syncTokenIssuedAt: now, syncTokenRotatedAt: now }
        : {}),
      assignedAt: now,
    });
  }

  updateSyncState(payload: LocalInstallationSyncStatePayload) {
    return this.upsert({
      ...(payload.lastConfigurationVersion != null ? { lastConfigurationVersion: payload.lastConfigurationVersion } : {}),
      ...(payload.lastAccessVersion != null ? { lastAccessVersion: payload.lastAccessVersion } : {}),
      lastSyncAt: payload.lastSyncAt,
      lastSyncStatus: payload.lastSyncStatus,
      lastSyncError: payload.lastSyncError ?? "",
    });
  }
}
