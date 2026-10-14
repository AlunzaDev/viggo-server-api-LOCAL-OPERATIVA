import type { Prisma, UserApp } from "../../../generated/prisma/client";
import { AUTH_ROLES, USER_APPS } from "../../../domain/constants";
import {
  ConfigSyncDatasource,
  type ConfigIntegritySnapshot,
  type ConfigSyncAuditInput,
} from "../../../domain/datasources/config/config-sync.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { isUuid } from "../postgres/prisma-errors";
import { prismaDb } from "../system/transaction-runner.postgres";

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const toBigInt = (value: number | null) => (value === null ? null : BigInt(value));
const toNumber = (value: bigint | null) => (value === null ? null : Number(value));

export class ConfigSyncPostgresDatasource implements ConfigSyncDatasource {
  async getIntegritySnapshot(proyectoId: string, tx?: TransactionContext): Promise<ConfigIntegritySnapshot> {
    const db = prismaDb(tx);
    const empty: ConfigIntegritySnapshot = { proyectoExists: false, modulos: [], pensiones: [], pensionPasses: [], usuarios: [] };
    if (!isUuid(proyectoId)) return empty;

    // Sequential: a transaction client runs one query at a time.
    const proyectoExists = (await db.proyecto.count({ where: { id: proyectoId } })) > 0;
    const modulos = await db.modulo.findMany({
      where: { proyectoId },
      select: { id: true, tipo: true, identificador: true, submodulos: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    const pensiones = await db.pension.findMany({
      where: { proyectoId },
      select: { id: true, _count: { select: { horarios: true } } },
    });
    // The foreign key already rules out passes of unknown pensions; this keeps the check scoped.
    const pensionPasses = await db.pensionPass.findMany({
      where: { pension: { proyectoId } },
      select: { id: true, pensionId: true },
    });
    const usuarios = await db.usuario.findMany({
      where: { OR: [{ parkings: { has: proyectoId } }, { rol: AUTH_ROLES.SUPER }] },
      select: {
        id: true,
        appPermissions: { where: { app: USER_APPS.OPERATIVE_WEB }, select: { permissionProfileId: true } },
      },
    });

    return {
      proyectoExists,
      modulos: modulos.map((modulo) => ({
        id: modulo.id,
        tipo: modulo.tipo,
        identificador: modulo.identificador.trim(),
        submodulos: modulo.submodulos.map((submodulo) => ({
          submoduloId: submodulo.submoduloId,
          tipo: submodulo.tipo,
          nombre: submodulo.nombre.trim(),
        })),
      })),
      pensiones: pensiones.map((pension) => ({ id: pension.id, validezDays: pension._count.horarios })),
      pensionPasses,
      usuarios: usuarios.map((usuario) => ({
        id: usuario.id,
        operativeProfileId: usuario.appPermissions[0]?.permissionProfileId ?? "",
      })),
    };
  }

  async findExistingPermissionProfileIds(ids: string[], app: string, tx?: TransactionContext) {
    const valid = ids.filter(isUuid);
    if (valid.length === 0) return [];
    const profiles = await prismaDb(tx).permissionProfile.findMany({
      where: { id: { in: valid }, app: app as UserApp },
      select: { id: true },
    });
    return profiles.map((profile) => profile.id);
  }

  async recordAudit(audit: ConfigSyncAuditInput) {
    await prismaDb().configSyncAudit.create({
      data: {
        installationId: audit.installationId,
        proyectoId: audit.proyectoId,
        proyectoNombre: audit.proyectoNombre,
        triggeredByUserId: audit.triggeredByUserId,
        triggeredByUserName: audit.triggeredByUserName,
        triggerSource: audit.triggerSource,
        status: audit.status,
        startedAt: new Date(audit.startedAt),
        finishedAt: new Date(audit.finishedAt),
        durationMs: audit.durationMs,
        configurationVersion: toBigInt(audit.configurationVersion),
        accessVersion: toBigInt(audit.accessVersion),
        counts: asJson(audit.counts),
        errorMessage: audit.errorMessage,
        errorCode: audit.errorCode,
        metadata: asJson(audit.metadata),
      },
    });
  }

  /** Same shape the API returned with Mongo: epoch-ms dates. */
  async getAuditHistory(limit: number) {
    const rows = await prismaDb().configSyncAudit.findMany({ orderBy: { startedAt: "desc" }, take: limit });
    return rows.map((row) => ({
      ...row,
      startedAt: row.startedAt.getTime(),
      finishedAt: row.finishedAt.getTime(),
      configurationVersion: toNumber(row.configurationVersion),
      accessVersion: toNumber(row.accessVersion),
    })) as Record<string, unknown>[];
  }
}
