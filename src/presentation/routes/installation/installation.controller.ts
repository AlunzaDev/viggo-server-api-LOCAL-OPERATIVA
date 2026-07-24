import { Request, Response } from "express";
import { envs } from "../../../config";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { LocalInstallationModel } from "../../../data/mongo/models/system/local-installation.schema";
import { getAuthenticatedRequestUser } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import { InstallationIdentityService } from "../../services/installation/installation-identity.service";
import { InstallationTokenCryptoService } from "../../services/installation/installation-token-crypto.service";

const DEFAULT_INSTALLATION_KEY = "default";

type PlainRecord = Record<string, unknown>;

const cloudHeaders = async () => ({
  Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
  "Content-Type": "application/json",
  "X-Viggo-Installation-Id": await InstallationIdentityService.getInstallationId(),
});

const cloudUrl = (path: string) =>
  `${envs.NUBEADMIN_API_URL.replace(/\/+$/, "")}${path}`;

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
  getStatus = async (_req: Request, res: Response) => {
    try {
      const installation = await this.ensureInstallation();
      return res.status(200).json({ installation: await serializeInstallation(installation) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getCloudProjects = async (_req: Request, res: Response) => {
    try {
      const response = await fetch(cloudUrl("/api/sync/projects"), {
        headers: await cloudHeaders(),
      });
      const data = (await response.json().catch(() => ({}))) as PlainRecord;

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error ?? "No se pudieron consultar proyectos en NUBEADMIN",
        });
      }

      return res.status(200).json({ proyectos: data.proyectos ?? [] });
    } catch (_error) {
      return res.status(503).json({
        error: "NUBEADMIN no esta disponible para consultar proyectos",
      });
    }
  };

  requestProjectLink = async (req: Request, res: Response) => {
    try {
      const proyectoId = String(req.body?.proyectoId ?? "").trim();
      const installationLinkToken = String(req.body?.installationLinkToken ?? "").trim();
      if (!proyectoId) return res.status(400).json({ error: "proyectoId es requerido" });
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
        headers: await cloudHeaders(),
        body: JSON.stringify({
          proyectoId,
          installationLinkToken,
          localApiBaseUrl: envs.WEB_SERVICE_URL,
          requestedByUserId: authUser?.id ?? "",
          requestedByUserName,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as PlainRecord;

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error ?? "No se pudo solicitar la vinculacion en NUBEADMIN",
        });
      }

      const request = (data.request ?? {}) as PlainRecord;
      const encryptedSyncToken = InstallationTokenCryptoService.encrypt(
        installationLinkToken,
      );
      const installation = await LocalInstallationModel.findOneAndUpdate(
        { key: DEFAULT_INSTALLATION_KEY },
        {
          key: DEFAULT_INSTALLATION_KEY,
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
          updatedAt: Date.now(),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();

      return res.status(202).json({ installation: await serializeInstallation(installation) });
    } catch (_error) {
      return res.status(503).json({
        error: "NUBEADMIN no esta disponible para solicitar la vinculacion",
      });
    }
  };

  private async ensureInstallation(): Promise<PlainRecord | null> {
    const existing = await LocalInstallationModel.findOne({
      key: DEFAULT_INSTALLATION_KEY,
    }).lean();

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
      await ProyectoModel.findByIdAndUpdate(
        String(project._id ?? project.id),
        normalizeProject(project),
        { new: true, upsert: true, setDefaultsOnInsert: true },
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

    return LocalInstallationModel.findOneAndUpdate(
      { key: DEFAULT_INSTALLATION_KEY },
      {
        key: DEFAULT_INSTALLATION_KEY,
        proyectoId: "",
        proyectoNombre: String(request.proyectoNombre ?? ""),
        proyectoIdentificador: String(request.proyectoIdentificador ?? ""),
        source: "cloudApproval",
        status: request.status === "rejected" ? "rejected" : "requested",
        cloudRequestId: String(request._id ?? request.id ?? ""),
        reviewNote: String(request.reviewNote ?? ""),
        requestedAt: request.requestedAt,
        reviewedAt: request.reviewedAt,
        updatedAt: Date.now(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  }

  private async linkLocalProject(
    proyectoId: string,
    source: "env" | "cloudApproval",
    cloudRequestId: string,
    oneTimeSyncToken = "",
  ): Promise<PlainRecord | null> {
    const proyecto = await ProyectoModel.findById(proyectoId).lean();
    const encryptedSyncToken = oneTimeSyncToken
      ? InstallationTokenCryptoService.encrypt(oneTimeSyncToken)
      : undefined;
    return LocalInstallationModel.findOneAndUpdate(
      { key: DEFAULT_INSTALLATION_KEY },
      {
        key: DEFAULT_INSTALLATION_KEY,
        proyectoId,
        proyectoNombre: String(proyecto?.nombre ?? ""),
        proyectoIdentificador: String(proyecto?.identificador ?? ""),
        source,
        status: "linked",
        cloudRequestId,
        ...(encryptedSyncToken
          ? {
              encryptedSyncToken,
              syncTokenIssuedAt: Date.now(),
              syncTokenRotatedAt: Date.now(),
            }
          : {}),
        assignedAt: Date.now(),
        updatedAt: Date.now(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  }

  private async getCloudRequestStatus(): Promise<{
    request?: PlainRecord;
    proyecto?: PlainRecord;
    oneTimeSyncToken?: string | null;
  } | null> {
    if (!envs.SYNC_SERVICE_TOKEN) return null;

    try {
      const response = await fetch(cloudUrl("/api/sync/installation-request/status"), {
        headers: await cloudHeaders(),
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
