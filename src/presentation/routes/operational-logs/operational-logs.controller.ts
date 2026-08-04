import { Request, Response } from "express";
import {
  canAccessProjectFromRequest,
  ensureProjectAccessFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares/auth.middleware";
import { ErrorService } from "../../services/error.service";
import {
  type OperationalLogKind,
  type OperationalLogScope,
  type OperationalLogSeverity,
} from "../../../domain/entities/system/operational-log.entity";
import { OperationalLogsService } from "../../services/operational-logs/operational-logs.service";
import {
  normalizeLogRange,
  parseOptionalTimestamp,
  parsePositiveInteger,
  parseStrictEnum,
} from "../../services/operational-logs/operational-logs.helpers";

export class OperationalLogsController {
  constructor(private readonly service: OperationalLogsService) {}

  list = async (req: Request, res: Response) => {
    try {
      const page = parsePositiveInteger(req.query.page, 1);
      const limit = parsePositiveInteger(req.query.limit, 30, 200);
      const now = Date.now();
      const kind = parseStrictEnum(
        req.query.kind,
        ["event", "incident"] as const satisfies readonly OperationalLogKind[],
        "kind",
      );
      const scope = parseStrictEnum(
        req.query.scope,
        ["access_flow", "device", "payment", "system"] as const satisfies readonly OperationalLogScope[],
        "scope",
      );
      const severity = parseStrictEnum(
        req.query.severity,
        ["info", "warning", "critical"] as const satisfies readonly OperationalLogSeverity[],
        "severity",
      );
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
      const moduloId = typeof req.query.moduloId === "string" ? req.query.moduloId.trim() : "";
      const ticketId = typeof req.query.ticketId === "string" ? req.query.ticketId.trim() : "";
      const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const from = parseOptionalTimestamp(req.query.from, "from");
      const to = parseOptionalTimestamp(req.query.to, "to");
      const range = normalizeLogRange({ from, to, now });

      if (projectId && !canAccessProjectFromRequest(req, projectId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const response = await this.service.list({
        page,
        limit,
        kind,
        scope,
        severity,
        projectId: projectId || undefined,
        projectIds:
          projectId || isSuperAdminRequest(req)
            ? undefined
            : getAllowedProjectIdsFromRequest(req),
        moduloId: moduloId || undefined,
        ticketId: ticketId || undefined,
        type: type || undefined,
        search: search || undefined,
        from: range.from,
        to: range.to,
      });

      return res.status(200).json({
        items: response.logs,
        pagination: {
          page: response.page,
          limit: response.limit,
          total: response.total,
          totalPages: response.totalPages,
        },
        summary: response.summary,
      });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getByProject = async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId ?? "").trim();
      ensureProjectAccessFromRequest(req, projectId);

      req.query.projectId = projectId;
      return this.list(req, res);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
