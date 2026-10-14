import { PostgresDatabase } from "../../../data/postgres";
import type { OperationalLog as OperationalLogRow, Prisma } from "../../../generated/prisma/client";
import {
  OperationalLogDatasource,
  type OperationalLogListQuery,
  type OperationalLogListResult,
} from "../../../domain/datasources/system/operational-log.datasource";
import { OperationalLogEntity } from "../../../domain/entities/system/operational-log.entity";

const toOperationalLogEntity = (row: OperationalLogRow): OperationalLogEntity =>
  OperationalLogEntity.fromObject({
    ...row,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });

const createdAtRange = (range: { from?: number; to?: number }) =>
  range.from !== undefined || range.to !== undefined
    ? {
        ...(range.from !== undefined ? { gte: new Date(range.from) } : {}),
        ...(range.to !== undefined ? { lte: new Date(range.to) } : {}),
      }
    : undefined;

const buildWhere = (query: OperationalLogListQuery): Prisma.OperationalLogWhereInput => {
  const where: Prisma.OperationalLogWhereInput = {};
  if (query.kind) where.kind = query.kind;
  if (query.scope) where.scope = query.scope;
  if (query.severity) where.severity = query.severity;
  if (query.projectId) where.projectId = query.projectId;
  else if (query.projectIds?.length) where.projectId = { in: query.projectIds };
  if (query.moduloId) where.moduloId = query.moduloId;
  if (query.ticketId) where.ticketId = query.ticketId;
  if (query.type) where.type = query.type;
  const createdAt = createdAtRange(query);
  if (createdAt) where.createdAt = createdAt;
  const search = query.search?.trim();
  if (search) {
    where.OR = (["message", "type", "moduloNombre", "projectName", "ticketId"] as const).map((field) => ({
      [field]: { contains: search, mode: "insensitive" },
    }));
  }
  return where;
};

const countsBy = (rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: string) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    acc[String(row[key] || "unknown")] = row._count._all;
    return acc;
  }, {});

export class OperationalLogPostgresDatasource implements OperationalLogDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async create(log: Omit<OperationalLogEntity, "id">): Promise<OperationalLogEntity> {
    const row = await this.db.operationalLog.create({
      data: {
        kind: log.kind,
        scope: log.scope,
        type: log.type,
        severity: log.severity,
        installationId: log.installationId ?? "",
        projectId: log.projectId ?? "",
        projectName: log.projectName ?? "",
        moduloId: log.moduloId ?? "",
        moduloNombre: log.moduloNombre ?? "",
        submoduloId: log.submoduloId ?? "",
        submoduloNombre: log.submoduloNombre ?? "",
        ticketId: log.ticketId ?? "",
        paymentSessionId: log.paymentSessionId ?? "",
        flowId: log.flowId ?? "",
        source: log.source,
        message: log.message,
        statusBefore: log.statusBefore ?? "",
        statusAfter: log.statusAfter ?? "",
        metadata: (log.metadata ?? {}) as Prisma.InputJsonValue,
        createdAt: new Date(log.createdAt),
        updatedAt: new Date(log.updatedAt),
      },
    });
    return toOperationalLogEntity(row);
  }

  async list(query: OperationalLogListQuery): Promise<OperationalLogListResult> {
    const where = buildWhere(query);
    const [rows, total, byKind, bySeverity] = await Promise.all([
      this.db.operationalLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.operationalLog.count({ where }),
      this.db.operationalLog.groupBy({ by: ["kind"], where, _count: { _all: true } }),
      this.db.operationalLog.groupBy({ by: ["severity"], where, _count: { _all: true } }),
    ]);
    return {
      logs: rows.map(toOperationalLogEntity),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      summary: { byKind: countsBy(byKind, "kind"), bySeverity: countsBy(bySeverity, "severity") },
    };
  }

  async listByCreatedAtRange(range: { from: number; to: number }): Promise<OperationalLogEntity[]> {
    const rows = await this.db.operationalLog.findMany({
      where: { createdAt: createdAtRange(range) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toOperationalLogEntity);
  }

  async deleteByCreatedAtRange(range: { from: number; to: number }): Promise<number> {
    const result = await this.db.operationalLog.deleteMany({ where: { createdAt: createdAtRange(range) } });
    return result.count;
  }
}
