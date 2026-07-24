import { NextFunction, Request, Response } from "express";
import { envs } from "../../config";

export type SyncRequest = Request & { syncSource?: string };

export const requireSyncAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authorization = req.header("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  const syncSource = req.header("X-Viggo-Sync-Source")?.trim();

  if (!envs.SYNC_SERVICE_TOKEN) {
    return res.status(503).json({ error: "SYNC_SERVICE_TOKEN no esta configurado" });
  }
  if (!token || token !== envs.SYNC_SERVICE_TOKEN) {
    return res.status(401).json({ error: "Invalid service token" });
  }

  (req as SyncRequest).syncSource = syncSource || "nubeadmin";
  next();
};

