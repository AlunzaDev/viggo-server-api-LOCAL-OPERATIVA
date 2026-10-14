import { NextFunction, Request, Response } from "express";

import { LocalInstallationService } from "../services/installation/local-installation.service";

export type LocalProjectScopedRequest = Request & {
  localProjectId?: string;
};

const PROJECT_FIELDS = ["proyecto", "proyectoId", "projectId"] as const;

const getExplicitProjectIds = (req: Request): string[] => {
  const sources: unknown[] = [req.query, req.body];
  const ids: string[] = [];

  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;

    const record = source as Record<string, unknown>;
    for (const field of PROJECT_FIELDS) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) ids.push(value.trim());
    }
  }

  return ids;
};

export class LocalProjectScopeMiddleware {
  constructor(private readonly installations: LocalInstallationService) {}

  requireLinkedProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const installation = await this.installations.findDefault();
      const localProjectId = String(installation?.proyectoId ?? "").trim();

      if (installation?.status !== "linked" || !localProjectId) {
        return res.status(503).json({
          error: "La instalacion operativa no esta vinculada a un proyecto",
          code: "LOCAL_PROJECT_NOT_LINKED",
        });
      }

      const conflictingProjectId = getExplicitProjectIds(req).find(
        (projectId) => projectId !== localProjectId,
      );

      if (conflictingProjectId) {
        return res.status(403).json({
          error: "El proyecto solicitado no pertenece a esta instalacion",
          code: "LOCAL_PROJECT_SCOPE_VIOLATION",
        });
      }

      (req as LocalProjectScopedRequest).localProjectId = localProjectId;
      return next();
    } catch (_error) {
      return res.status(503).json({
        error: "No fue posible validar el proyecto de la instalacion",
        code: "LOCAL_PROJECT_SCOPE_UNAVAILABLE",
      });
    }
  };
}
