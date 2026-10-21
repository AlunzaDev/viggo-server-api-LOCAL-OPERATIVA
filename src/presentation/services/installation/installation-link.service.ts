import { envs } from "../../../config";
import { CustomError } from "../../../domain/errors/custom.error";
import type { OutboxRepository } from "../../../domain/repositories/system/outbox.repository";
import { InstallationIdentityService } from "./installation-identity.service";
import type { InstallationServices } from "./installation-service.factory";
import { InstallationTokenCryptoService } from "./installation-token-crypto.service";

type PlainRecord = Record<string, unknown>;

/** Who asks to link or reset the installation (OPERATIVO's logged-in user, when there is one). */
export interface LinkRequester {
  id?: string;
  nombre?: string;
  apellido?: string;
}

export interface LinkRequestInput {
  installationLinkToken: string;
  browserCoordinates?: unknown;
  browserLocationAccuracy?: unknown;
  browserLocationCapturedAt?: unknown;
}

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

const ENV_LINK_ALLOWED = new Set(["dev", "test"]);
let envLinkWarned = false;
const warnEnvLinkIgnored = () => {
  if (envLinkWarned) return;
  envLinkWarned = true;
  console.warn(
    `[OPERATIVO installation] PROJECT_ID ignorado con APP_ENV=${envs.APP_ENV}: vincula la instalacion con el token del proyecto.`,
  );
};

const cloudUrl = (path: string) => `${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}${path}`;

/** The cloud refused: its status code and its message. */
const cloudError = (status: number, data: PlainRecord, fallback: string) =>
  new CustomError(status, String(data.error ?? fallback), "CLOUD_REJECTED");

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
    proyectoIdentificador: String(value?.proyectoIdentificador ?? "").trim() || null,
    cloudRequestId: String(value?.cloudRequestId ?? "").trim() || null,
    reviewNote: String(value?.reviewNote ?? "").trim() || null,
    requestedAt: value?.requestedAt ?? null,
    reviewedAt: value?.reviewedAt ?? null,
    assignedByUserId: String(value?.assignedByUserId ?? "").trim() || null,
    assignedAt: value?.assignedAt ?? null,
    hasEncryptedSyncToken: Boolean(String(value?.encryptedSyncToken ?? "").trim()),
    // Linked by PROJECT_ID or the seed, or with a token that no longer decrypts: the cloud
    // cannot be reached (no online login, sync or outbox) until it is linked again.
    cloudCredentials: status === "linked" && Boolean(await InstallationIdentityService.getCloudCredentials()),
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

/** Linking this installation to its project in the cloud, its status and its reset. */
export class InstallationLinkService {
  constructor(
    private readonly services: InstallationServices,
    private readonly outbox: OutboxRepository,
    /** Called once the cloud approved the link and handed over the sync token. */
    private readonly onCloudLinked: () => void = () => undefined,
  ) {}

  /**
   * Unlinks this installation so it can be linked again (another project, a replaced
   * server). Refused while local changes are still waiting to reach the cloud, so none is
   * lost; the operator types the installation id to confirm.
   */
  async reset(confirmation: string, requester: LinkRequester | undefined) {
    const installationId = await InstallationIdentityService.getInstallationId();
    if (confirmation.trim() !== installationId) {
      throw CustomError.badRequest("Confirma con el ID de esta instalacion", undefined, "INSTALLATION_ID_MISMATCH");
    }
    const { pending } = await this.outbox.stats();
    if (pending > 0) {
      throw CustomError.conflict(
        `Hay ${pending} cambios locales sin enviar a la nube. Conecta la instalacion y espera a que se envien antes de reiniciarla.`,
        { pending },
        "OUTBOX_PENDING",
      );
    }
    const previous = await this.services.localInstallationService.findDefault();
    console.warn("[OPERATIVO installation] Instalacion reiniciada", {
      installationId,
      previousProyectoId: previous?.proyectoId ?? "",
      userId: requester?.id ?? "",
    });
    return serializeInstallation(await this.services.localInstallationService.resetLink());
  }

  /** The installation as the web shows it; it also picks up a link the cloud approved. */
  async status() {
    return serializeInstallation(await this.ensureInstallation());
  }

  /** Project the link token belongs to, so the operator confirms it before linking. */
  async previewLink(installationLinkToken: string) {
    if (!installationLinkToken) throw CustomError.badRequest("Token de vinculacion requerido");
    let response: Response;
    try {
      response = await fetch(cloudUrl("/api/sync/installation-link/preview"), {
        method: "POST",
        headers: await linkHeaders(installationLinkToken),
      });
    } catch {
      throw CustomError.serviceUnavailable("La nube no esta disponible para validar el token de vinculacion");
    }
    const data = (await response.json().catch(() => ({}))) as PlainRecord;
    if (!response.ok) throw cloudError(response.status, data, "No se pudo validar el token de vinculacion");
    return data.proyecto ?? null;
  }

  /** Asks the cloud to link this installation; the request waits for an admin's approval. */
  async requestLink(input: LinkRequestInput, requester: LinkRequester | undefined) {
    const installationLinkToken = input.installationLinkToken.trim();
    if (!installationLinkToken) throw CustomError.badRequest("Token de vinculacion requerido");
    const raw = Array.isArray(input.browserCoordinates) ? input.browserCoordinates : [];
    const longitude = Number(raw[0]), latitude = Number(raw[1]);
    const browserCoordinates = raw.length === 2 && Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : undefined;
    const accuracy = Number(input.browserLocationAccuracy);
    const capturedAt = Number(input.browserLocationCapturedAt);

    let response: Response;
    try {
      response = await fetch(cloudUrl("/api/sync/installation-requests"), {
        method: "POST",
        headers: await linkHeaders(installationLinkToken),
        body: JSON.stringify({
          localApiBaseUrl: envs.WEB_SERVICE_URL,
          browserCoordinates,
          browserLocationAccuracy: Number.isFinite(accuracy) ? accuracy : undefined,
          browserLocationCapturedAt: Number.isFinite(capturedAt) ? capturedAt : undefined,
          requestedByUserId: requester?.id ?? "",
          requestedByUserName: [requester?.nombre, requester?.apellido].filter(Boolean).join(" ").trim(),
        }),
      });
    } catch {
      throw CustomError.serviceUnavailable("La nube no esta disponible para solicitar la vinculacion");
    }
    const data = (await response.json().catch(() => ({}))) as PlainRecord;
    if (!response.ok) throw cloudError(response.status, data, "No se pudo solicitar la vinculacion en la nube");

    const request = (data.request ?? {}) as PlainRecord;
    // Kept (encrypted) only to poll the request status; replaced by the installation's
    // own sync token once the cloud approves the link.
    const installation = await this.services.localInstallationService.upsertRequest({
      proyectoId: "",
      proyectoNombre: String(request.proyectoNombre ?? ""),
      proyectoIdentificador: String(request.proyectoIdentificador ?? ""),
      source: "cloudApproval",
      status: request.status === "approved" ? "approved" : "requested",
      cloudRequestId: String(request._id ?? request.id ?? ""),
      encryptedSyncToken: InstallationTokenCryptoService.encrypt(installationLinkToken),
      syncTokenIssuedAt: Date.now(),
      syncTokenRotatedAt: Date.now(),
      requestedAt: request.requestedAt ?? Date.now(),
    });
    return serializeInstallation(installation);
  }

  private async ensureInstallation(): Promise<PlainRecord | null> {
    const existing = await this.services.localInstallationService.findDefault();

    if (existing?.status === "linked") return existing;

    const envProjectId = envs.PROJECT_ID.trim();
    if (!existing && envProjectId) {
      // PROJECT_ID links without cloud credentials: only for local development and tests.
      if (ENV_LINK_ALLOWED.has(envs.APP_ENV)) return this.linkLocalProject(envProjectId, "env", "");
      warnEnvLinkIgnored();
    }

    const cloudStatus = await this.getCloudRequestStatus();
    if (!cloudStatus) return existing;

    const request = cloudStatus.request;
    if (!request) return existing;

    if (request.status === "approved" && cloudStatus.proyecto) {
      const project = cloudStatus.proyecto;
      await this.services.localInstallationService.upsertProject(String(project._id ?? project.id), normalizeProject(project));

      const linked = await this.linkLocalProject(
        String(project._id ?? project.id),
        "cloudApproval",
        String(request._id ?? request.id ?? ""),
        typeof cloudStatus.oneTimeSyncToken === "string" ? cloudStatus.oneTimeSyncToken : "",
      );
      // Configuration (modules, users, pensions) right away, instead of waiting for the
      // scheduled sync; the cloud cannot trigger it, there is no shared token anymore.
      this.onCloudLinked();
      return linked;
    }

    return this.services.localInstallationService.upsertRequest({
      proyectoId: "",
      proyectoNombre: String(request.proyectoNombre ?? ""),
      proyectoIdentificador: String(request.proyectoIdentificador ?? ""),
      source: "cloudApproval",
      status: request.status === "rejected" ? "rejected" : "requested",
      cloudRequestId: String(request._id ?? request.id ?? ""),
      reviewNote: String(request.reviewNote ?? ""),
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
    });
  }

  private async linkLocalProject(
    proyectoId: string,
    source: "env" | "cloudApproval",
    cloudRequestId: string,
    oneTimeSyncToken = "",
  ): Promise<PlainRecord | null> {
    const proyecto = await this.services.localInstallationService.findProjectById(proyectoId);
    const encryptedSyncToken = oneTimeSyncToken ? InstallationTokenCryptoService.encrypt(oneTimeSyncToken) : undefined;
    return this.services.localInstallationService.linkProject({
      proyectoId,
      proyectoNombre: String(proyecto?.nombre ?? ""),
      proyectoIdentificador: String(proyecto?.identificador ?? ""),
      source,
      cloudRequestId,
      encryptedSyncToken,
    });
  }

  private async getCloudRequestStatus(): Promise<{ request?: PlainRecord; proyecto?: PlainRecord; oneTimeSyncToken?: string | null } | null> {
    const existing = await this.services.localInstallationService.findDefault();
    const encrypted = String(existing?.encryptedSyncToken ?? "").trim();
    if (!encrypted) return null;

    try {
      const response = await fetch(cloudUrl("/api/sync/installation-request/status"), {
        headers: await linkHeaders(InstallationTokenCryptoService.decrypt(encrypted)),
      });
      if (!response.ok) return null;
      return (await response.json()) as { request?: PlainRecord; proyecto?: PlainRecord; oneTimeSyncToken?: string | null };
    } catch {
      return null;
    }
  }
}
