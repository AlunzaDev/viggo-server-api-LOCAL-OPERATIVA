import { OperationalLogModel } from "../../../data/mongo/models/system/operational-log.schema";
import {
  type OperationalLogListQuery,
  type OperationalLogListResult,
  OperationalLogDatasource,
} from "../../../domain/datasources/system/operational-log.datasource";
import { OperationalLogEntity } from "../../../domain/entities/system/operational-log.entity";

export class OperationalLogMongoDatasource implements OperationalLogDatasource {
  async create(
    log: Omit<OperationalLogEntity, "id">,
  ): Promise<OperationalLogEntity> {
    const created = await OperationalLogModel.create(log);
    return OperationalLogEntity.fromObject(created.toJSON());
  }

  async list(query: OperationalLogListQuery): Promise<OperationalLogListResult> {
    const filters: Record<string, unknown> = {};

    if (query.kind) filters.kind = query.kind;
    if (query.scope) filters.scope = query.scope;
    if (query.severity) filters.severity = query.severity;
    if (query.projectId) filters.projectId = query.projectId;
    else if (Array.isArray(query.projectIds) && query.projectIds.length > 0) {
      filters.projectId = { $in: query.projectIds };
    }
    if (query.moduloId) filters.moduloId = query.moduloId;
    if (query.ticketId) filters.ticketId = query.ticketId;
    if (query.type) filters.type = query.type;
    if (query.from !== undefined || query.to !== undefined) {
      filters.createdAt = {
        ...(query.from !== undefined ? { $gte: query.from } : {}),
        ...(query.to !== undefined ? { $lte: query.to } : {}),
      };
    }
    if (query.search) {
      const safePattern = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filters.$or = [
        { message: { $regex: safePattern, $options: "i" } },
        { type: { $regex: safePattern, $options: "i" } },
        { moduloNombre: { $regex: safePattern, $options: "i" } },
        { projectName: { $regex: safePattern, $options: "i" } },
        { ticketId: { $regex: safePattern, $options: "i" } },
      ];
    }

    const [items, total, kindCounts, severityCounts] = await Promise.all([
      OperationalLogModel.find(filters)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      OperationalLogModel.countDocuments(filters),
      OperationalLogModel.aggregate([
        { $match: filters },
        { $group: { _id: "$kind", total: { $sum: 1 } } },
      ]),
      OperationalLogModel.aggregate([
        { $match: filters },
        { $group: { _id: "$severity", total: { $sum: 1 } } },
      ]),
    ]);

    return {
      logs: items.map((item) => OperationalLogEntity.fromObject(item.toJSON())),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      summary: {
        byKind: kindCounts.reduce<Record<string, number>>((acc, row) => {
          acc[String(row._id || "unknown")] = Number(row.total ?? 0);
          return acc;
        }, {}),
        bySeverity: severityCounts.reduce<Record<string, number>>((acc, row) => {
          acc[String(row._id || "unknown")] = Number(row.total ?? 0);
          return acc;
        }, {}),
      },
    };
  }

  async listByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<OperationalLogEntity[]> {
    const items = await OperationalLogModel.find({
      createdAt: { $gte: range.from, $lte: range.to },
    })
      .sort({ createdAt: 1 })
      .lean();

    return items.map((item) => OperationalLogEntity.fromObject(item));
  }

  async deleteByCreatedAtRange(range: {
    from: number;
    to: number;
  }): Promise<number> {
    const result = await OperationalLogModel.deleteMany({
      createdAt: { $gte: range.from, $lte: range.to },
    });
    return Number(result.deletedCount ?? 0);
  }
}
