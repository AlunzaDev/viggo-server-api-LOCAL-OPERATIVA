import { Request, Response } from "express";
import { envs } from "../../../config";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { InstallationIdentityService } from "../../services/installation/installation-identity.service";
import { InstallationTokenCryptoService } from "../../services/installation/installation-token-crypto.service";
import type { InstallationServices } from "../../services/installation/installation-service.factory";

type PlainRecord = Record<string, unknown>;

/**
 * Linking calls authenticate with the project's installation link token typed by the
 * operator; the cloud finds the project from it. Once approved, the cloud hands this
 * installation its own sync token, which replaces the link token.
 */
const linkHeaders = async (installationLinkToken: string) =>
  InstallationIdentityService.cloudHeaders({
    token: installationLinkToken,
    installationId: await InstallationIdentityService.getInstallationId(),
  });

const cloudUrl = (path: string) =>
  `${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}${path}`;

const serializeInstallation = async (value: PlainRecord | null) => {
  const proyectoId = String(value?.proyectoId ?? "").trim();
  const status = String(value?.status ?? (proyectoId ? "linked" : "pending")).trim();

  return {
    configured: Boolean(proyectoId) && status === "linked",
    installationId: await InstallationIdentityService.getInstallationId(),
    status: status || "pending",
    source: value?.source ?? "manual",
    proyectoId: proyectoId || null,
    proyectoNombre: String(value?.proyectoNombre ?? "").trim() || null,
    proyectoIdentificador:
      String(value?.proyectoIdentificador ?? "").trim() || null,
    cloudRequestId: String(value?.cloudRequestId ?? "").trim() || null,
    reviewNote: String(value?.reviewNote ?? "").trim() || null,
    requestedAt: value?.requestedAt ?? null,
    reviewedAt: value?.reviewedAt ?? null,
    assignedByUserId: String(value?.assignedByUserId ?? "").trim() || null,
    assignedAt: value?.assignedAt ?? null,
    hasEncryptedSyncToken: Boolean(String(value?.encryptedSyncToken ?? "").trim()),
    syncTokenIssuedAt: value?.syncTokenIssuedAt ?? null,
    updatedAt: value?.updatedAt ?? null,
  };
};

const normalizeProject = (value: PlainRecord) => ({
  nombre: String(value.nombre ?? ""),
  coordinates: Array.isArray(value.coordinates) ? value.coordinates : [0, 0],
  ciudad: String(value.ciudad ?? ""),
  identificador: String(value.identificador ?? ""),
  codigoProyecto: String(value.codigoProyecto ?? "") || undefined,
  serverIp: String(value.serverIp ?? ""),
  serverMac: String(value.serverMac ?? ""),
  localApiBaseUrl: String(value.localApiBaseUrl ?? ""),
  img: String(value.img ?? ""),
  descripcion: String(value.descripcion ?? ""),
  estado: value.estado !== false,
});

export class InstallationController {
  constructor(private readonly services: InstallationServices) {}

  getStatus = async (_req: Request, res: Response) => {
    try {
      const installation = await this.ensureInstallation();
      return res.status(200).json({ installation: await serializeInstallation(installation) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** Project the link token belongs to, so the operator confirms it before linking. */
  previewProjectLink = async (req: Request, res: Response) => {
    const installationLinkToken = String(req.body?.installationLinkToken ?? "").trim();
    if (!installationLinkToken) return res.status(400).json({ error: "Token de vinculacion requerido" });

    try {
      const response = await fetch(cloudUrl("/api/sync/installation-link/preview"), {
        method: "POST",
        headers: await linkHeaders(installationLinkToken),
      });
      const data = (await response.json().catch(() => ({}))) as PlainRecord;
      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error ?? "No se pudo validar el token de vinculacion",
        });
      }
      return res.status(200).json({ proyecto: data.proyecto ?? null });
    } catch (_error) {
      return res.status(503).json({
        error: "La nube no esta disponible para validar el token de vinculacion",
      });
    }
  };

  requestProjectLink = async (req: Request, res: Response) => {
    try {
      const installationLinkToken = String(req.body?.installationLinkToken ?? "").trim();
      const browserCoordinatesRaw = Array.isArray(req.body?.browserCoordinates)
        ? req.body.browserCoordinates
        : [];
      const browserLongitude = Number(browserCoordinatesRaw[0]);
      const browserLatitude = Number(browserCoordinatesRaw[1]);
      const browserCoordinates =
        browserCoordinatesRaw.length === 2 &&
        Number.isFinite(browserLongitude) &&
        Number.isFinite(browserLatitude)
          ? [browserLongitude, browserLatitude]
          : undefined;
      const browserLocationAccuracy = Number(req.body?.browserLocationAccuracy);
      const browserLocationCapturedAt = Number(req.body?.browserLocationCapturedAt);
      if (!installationLinkToken) {
        return res.status(400).json({ error: "Token de vinculacion requerido" });
      }

      const authUser = getAuthenticatedRequestUser(req);
      const requestedByUserName = [authUser?.nombre, authUser?.apellido]
        .filter(Boolean)
        .join(" ")
        .trim();

      const response = await fetch(cloudUrl("/api/sync/installation-requests"), {
        method: "POST",
        headers: await linkHeaders(installationLinkToken),
        body: JSON.stringify({
          localApiBaseUrl: envs.WEB_SERVICE_URL,
          browserCoordinates,
          browserLocationAccuracy: Number.isFinite(browserLocationAccuracy)
            ? browserLocationAccuracy
            : undefined,
          browserLocationCapturedAt: Number.isFinite(browserLocationCapturedAt)
            ? browserLocationCapturedAt
            : undefined,
          requestedByUserId: authUser?.id ?? "",
          requestedByUserName,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as PlainRecord;

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error ?? "No se pudo solicitar la vinculacion en la nube",
        });
      }

      const request = (data.request ?? {}) as PlainRecord;
      // Kept (encrypted) only to poll the request status; replaced by the installation's
      // own sync token once the cloud approves the link.
      const encryptedSyncToken = InstallationTokenCryptoService.encrypt(
        installationLinkToken,
      );
      const installation = await this.services.localInstallationService.upsertRequest(
        {
          proyectoId: "",
          proyectoNombre: String(request.proyectoNombre ?? ""),
          proyectoIdentificador: String(request.proyectoIdentificador ?? ""),
          source: "cloudApproval",
          status: request.status === "approved" ? "approved" : "requested",
          cloudRequestId: String(request._id ?? request.id ?? ""),
          encryptedSyncToken,
          syncTokenIssuedAt: Date.now(),
          syncTokenRotatedAt: Date.now(),
          requestedAt: request.requestedAt ?? Date.now(),
        },
      );

      return res.status(202).json({ installation: await serializeInstallation(installation) });
    } catch (_error) {
      return res.status(503).json({
        error: "La nube no esta disponible para solicitar la vinculacion",
      });
    }
  };

  private async ensureInstallation(): Promise<PlainRecord | null> {
    const existing = await this.services.localInstallationService.findDefault();

    if (existing?.status === "linked") return existing;

    const envProjectId = envs.PROJECT_ID.trim();
    if (!existing && envProjectId) {
      return this.linkLocalProject(envProjectId, "env", "");
    }

    const cloudStatus = await this.getCloudRequestStatus();
    if (!cloudStatus) return existing;

    const request = cloudStatus.request;
    if (!request) return existing;

    if (request.status === "approved" && cloudStatus.proyecto) {
      const project = cloudStatus.proyecto;
      await this.services.localInstallationService.upsertProject(
        String(project._id ?? project.id),
        normalizeProject(project),
      );

      return this.linkLocalProject(
        String(project._id ?? project.id),
        "cloudApproval",
        String(request._id ?? request.id ?? ""),
        typeof cloudStatus.oneTimeSyncToken === "string"
          ? cloudStatus.oneTimeSyncToken
          : "",
      );
    }

    return this.services.localInstallationService.upsertRequest(
      {
        proyectoId: "",
        proyectoNombre: String(request.proyectoNombre ?? ""),
        proyectoIdentificador: String(request.proyectoIdentificador ?? ""),
        source: "cloudApproval",
        status: request.status === "rejected" ? "rejected" : "requested",
        cloudRequestId: String(request._id ?? request.id ?? ""),
        reviewNote: String(request.reviewNote ?? ""),
        requestedAt: request.requestedAt,
        reviewedAt: request.reviewedAt,
      },
    );
  }

  private async linkLocalProject(
    proyectoId: string,
    source: "env" | "cloudApproval",
    cloudRequestId: string,
    oneTimeSyncToken = "",
  ): Promise<PlainRecord | null> {
    const proyecto = await this.services.localInstallationService.findProjectById(proyectoId);
    const encryptedSyncToken = oneTimeSyncToken
      ? InstallationTokenCryptoService.encrypt(oneTimeSyncToken)
      : undefined;
    return this.services.localInstallationService.linkProject(
      {
        proyectoId,
        proyectoNombre: String(proyecto?.nombre ?? ""),
        proyectoIdentificador: String(proyecto?.identificador ?? ""),
        source,
        cloudRequestId,
        encryptedSyncToken,
      },
    );
  }

  private async getCloudRequestStatus(): Promise<{
    request?: PlainRecord;
    proyecto?: PlainRecord;
    oneTimeSyncToken?: string | null;
  } | null> {
    const existing = await this.services.localInstallationService.findDefault();
    const encrypted = String(existing?.encryptedSyncToken ?? "").trim();
    if (!encrypted) return null;

    try {
      const response = await fetch(cloudUrl("/api/sync/installation-request/status"), {
        headers: await linkHeaders(InstallationTokenCryptoService.decrypt(encrypted)),
      });
      if (!response.ok) return null;
      return (await response.json()) as {
        request?: PlainRecord;
        proyecto?: PlainRecord;
        oneTimeSyncToken?: string | null;
      };
    } catch {
      return null;
    }
  }
}
