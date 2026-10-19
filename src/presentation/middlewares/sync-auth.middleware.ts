import { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { InstallationIdentityService } from "../services/installation/installation-identity.service";

export type SyncRequest = Request & { syncSource?: string };

const sameToken = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Calls from ADMINISTRATIVO. They carry a token derived from this installation's own sync
 * token (ADMINISTRATIVO keeps it when it issues the token), so there is no shared secret and
 * an unlinked installation accepts none.
 */
export const requireSyncAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authorization = req.header("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
    const syncSource = req.header("X-Viggo-Sync-Source")?.trim();

    const credentials = await InstallationIdentityService.getCloudCredentials();
    if (!credentials) {
      return res.status(503).json({ error: "La instalacion no esta vinculada a la nube" });
    }
    if (!token || !sameToken(token, InstallationIdentityService.adminCallToken(credentials))) {
      return res.status(401).json({ error: "Invalid service token" });
    }

    (req as SyncRequest).syncSource = syncSource || "administrativo";
    return next();
  } catch (error) {
    return next(error);
  }
};
