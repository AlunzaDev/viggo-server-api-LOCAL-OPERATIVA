import { envs } from "../../../config";
import {
  ConfigSyncAuditModel,
  ModuloModel,
  PensionModel,
  PensionPassModel,
  PermissionProfileModel,
  ProyectoModel,
  UsuarioModel,
} from "../../../data/mongo";
import { CustomError } from "../../../domain/errors/custom.error";
import { InstallationIdentityService } from "../installation/installation-identity.service";
import { LocalInstallationService } from "../installation/local-installation.service";
import { SyncService } from "../sync/sync.service";

type CloudResponse = Record<string, unknown>;
type SyncStatus = "success" | "success_with_warnings" | "failed";
type IntegritySeverity = "error" | "warning";
type IntegrityIssue = {
  severity: IntegritySeverity;
  scope: string;
  code: string;
  message: string;
  entityId?: string;
};
type IntegrityResult = {
  ok: boolean;
  checkedAt: number;
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
  counts: {
    proyecto: number;
    modulos: number;
    submodulos: number;
    pensiones: number;
    pensionPasses: number;
    usuarios: number;
    permissionProfiles: number;
  };
};
export type ConfigSyncActor = {
  userId?: string;
  userName?: string;
  triggerSource?: "manual" | "automatic" | "system";
};

const cloudUrl = (path: string) =>
  `${envs.NUBEADMIN_API_URL.replace(/\/+$/, "")}${path}`;

export class ConfigSyncService {
  constructor(
    private readonly localInstallationService: LocalInstallationService,
    private readonly syncService: SyncService,
  ) {}

  async getStatus() {
    const installation = await this.localInstallationService.findDefault();

    return {
      cloudApiUrl: envs.NUBEADMIN_API_URL,
      installationId: await InstallationIdentityService.getInstallationId(),
      configured: installation?.status === "linked" && Boolean(installation.proyectoId),
      proyectoId: installation?.proyectoId ?? null,
      proyectoNombre: installation?.proyectoNombre ?? null,
      proyectoIdentificador: installation?.proyectoIdentificador ?? null,
      lastLocalUpdateAt: installation?.updatedAt ?? null,
      lastConfigurationVersion: installation?.lastConfigurationVersion ?? null,
      lastAccessVersion: installation?.lastAccessVersion ?? null,
      lastSyncAt: installation?.lastSyncAt ?? null,
      lastSyncStatus: installation?.lastSyncStatus ?? null,
      lastSyncError: installation?.lastSyncError ?? "",
      syncTokenConfigured: Boolean(envs.SYNC_SERVICE_TOKEN),
    };
  }

  async syncNow(actor: ConfigSyncActor = {}) {
    const startedAt = Date.now();
    let installationId = "";
    let proyectoId = "";
    let proyectoNombre = "";

    const installation = await this.localInstallationService.findDefault();
    installationId = await InstallationIdentityService.getInstallationId();
    proyectoId = String(installation?.proyectoId ?? "").trim();
    proyectoNombre = String(installation?.proyectoNombre ?? "").trim();

    try {
      if (installation?.status !== "linked" || !proyectoId) {
        throw CustomError.badRequest("La instalacion local aun no esta vinculada a un proyecto");
      }
      if (!envs.SYNC_SERVICE_TOKEN) {
        throw CustomError.badRequest("SYNC_SERVICE_TOKEN no esta configurado");
      }

      const [configuration, access] = await Promise.all([
        this.fetchCloud(`/api/sync/configuration/${proyectoId}`),
        this.fetchCloud(`/api/sync/access-snapshot/${proyectoId}`),
      ]);

      const configurationVersion = Number(configuration.version ?? 0) || null;
      const accessVersion = Number(access.version ?? 0) || null;
      const configurationAlreadyApplied =
        configurationVersion !== null &&
        Number(installation.lastConfigurationVersion ?? 0) === configurationVersion;
      const accessAlreadyApplied =
        accessVersion !== null &&
        Number(installation.lastAccessVersion ?? 0) === accessVersion;

      const [configurationResult, accessResult] = await Promise.all([
        configurationAlreadyApplied
          ? Promise.resolve({
              proyecto: 0,
              modulos: 0,
              pensiones: 0,
              pensionPasses: 0,
              skipped: true,
              reason: "VERSION_ALREADY_APPLIED",
            })
          : this.syncService.applyConfigurationSnapshot({
              proyecto: (configuration.proyecto as Record<string, unknown> | undefined) ?? null,
              modulos: Array.isArray(configuration.modulos)
                ? (configuration.modulos as Record<string, unknown>[])
                : [],
              pensiones: Array.isArray(configuration.pensiones)
                ? (configuration.pensiones as Record<string, unknown>[])
                : [],
              pensionPasses: Array.isArray(configuration.pensionPasses)
                ? (configuration.pensionPasses as Record<string, unknown>[])
                : [],
            }),
        accessAlreadyApplied
          ? Promise.resolve({
              users: 0,
              permissionProfiles: 0,
              skipped: true,
              reason: "VERSION_ALREADY_APPLIED",
            })
          : this.syncService.applyAccessSnapshot({
              users: Array.isArray(access.users)
                ? (access.users as Record<string, unknown>[])
                : [],
              permissionProfiles: Array.isArray(access.permissionProfiles)
                ? (access.permissionProfiles as Record<string, unknown>[])
                : [],
            }),
      ]);
      const integrity = await this.validateLocalIntegrity(proyectoId);

      if (integrity.errors.length > 0) {
        throw CustomError.badRequest(
          "La sincronizacion dejo inconsistencias locales",
          { integrity },
          "SYNC_INTEGRITY_FAILED",
        );
      }

      const syncStatus: SyncStatus =
        integrity.warnings.length > 0 ? "success_with_warnings" : "success";

      const result = {
        syncedAt: Date.now(),
        configurationVersion,
        accessVersion,
        configuration: configurationResult,
        access: accessResult,
        integrity,
      };

      await this.localInstallationService.updateSyncState({
        lastConfigurationVersion: configurationVersion,
        lastAccessVersion: accessVersion,
        lastSyncAt: result.syncedAt,
        lastSyncStatus: syncStatus,
        lastSyncError: integrity.warnings[0]?.message ?? "",
      });

      await this.recordAudit({
        actor,
        installationId,
        proyectoId,
        proyectoNombre,
        startedAt,
        status: syncStatus,
        configurationVersion,
        accessVersion,
        counts: {
          proyecto: Number(configurationResult.proyecto ?? 0),
          modulos: Number(configurationResult.modulos ?? 0),
          pensiones: Number(configurationResult.pensiones ?? 0),
          pensionPasses: Number(configurationResult.pensionPasses ?? 0),
          users: Number(accessResult.users ?? 0),
          permissionProfiles: Number(accessResult.permissionProfiles ?? 0),
        },
        integrity,
      });

      return result;
    } catch (error) {
      await this.localInstallationService.updateSyncState({
        lastSyncAt: Date.now(),
        lastSyncStatus: "failed",
        lastSyncError: error instanceof Error ? error.message : "Error desconocido",
      });
      await this.recordAudit({
        actor,
        installationId,
        proyectoId,
        proyectoNombre,
        startedAt,
        status: "failed",
        error,
      });
      throw error;
    }
  }

  getAuditHistory(limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return ConfigSyncAuditModel.find()
      .sort({ startedAt: -1 })
      .limit(safeLimit)
      .lean();
  }

  private async fetchCloud(path: string): Promise<CloudResponse> {
    let response: Response;

    try {
      response = await fetch(cloudUrl(path), {
        headers: {
          Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
          "X-Viggo-Installation-Id": await InstallationIdentityService.getInstallationId(),
        },
      });
    } catch {
      throw CustomError.internalServer(
        "NUBEADMIN no esta disponible",
        { cloudApiUrl: envs.NUBEADMIN_API_URL },
        "NUBEADMIN_UNAVAILABLE",
      );
    }

    const data = (await response.json().catch(() => ({}))) as CloudResponse;
    if (!response.ok) {
      throw CustomError.badRequest(
        String(data.error ?? data.message ?? "No se pudo sincronizar con NUBEADMIN"),
        { status: response.status },
        "NUBEADMIN_SYNC_FAILED",
      );
    }

    return data;
  }

  private async validateLocalIntegrity(proyectoId: string): Promise<IntegrityResult> {
    const errors: IntegrityIssue[] = [];
    const warnings: IntegrityIssue[] = [];
    const validModuloTypes = new Set(["ENTRADA", "SALIDA", "POS"]);
    const validSubmoduloTypes = new Set([
      "QR_SCANNER",
      "PRINTER",
      "BARRIER",
      "CAMERA",
      "CASH_DRAWER",
      "CASH_ACCEPTOR",
      "DISPLAY",
      "KEYPAD",
      "OTHER",
    ]);

    const [proyecto, modulos, pensiones, pensionPasses, usuarios] = await Promise.all([
      ProyectoModel.findById(proyectoId).lean(),
      ModuloModel.find({ proyecto: proyectoId }).lean(),
      PensionModel.find({ proyecto: proyectoId }).lean(),
      PensionPassModel.find().lean(),
      UsuarioModel.find({
        $or: [{ parkings: proyectoId }, { rol: "SUPER_ROLE" }],
      }).lean(),
    ]);

    const addIssue = (
      severity: IntegritySeverity,
      scope: string,
      code: string,
      message: string,
      entityId?: string,
    ) => {
      const issue = { severity, scope, code, message, entityId };
      if (severity === "error") errors.push(issue);
      else warnings.push(issue);
    };

    if (!proyecto) {
      addIssue("error", "proyecto", "PROJECT_NOT_FOUND", "El proyecto vinculado no existe en LOCALOPE", proyectoId);
    }

    if (modulos.length === 0) {
      addIssue("warning", "modulos", "NO_MODULES", "El proyecto no tiene modulos locales sincronizados", proyectoId);
    }

    modulos.forEach((modulo) => {
      const moduloId = String(modulo._id);
      const tipo = String(modulo.tipo ?? "").trim();
      const identificador = String(modulo.identificador ?? "").trim();

      if (!validModuloTypes.has(tipo)) {
        addIssue("error", "modulos", "INVALID_MODULE_TYPE", `El modulo tiene tipo invalido: ${tipo || "sin tipo"}`, moduloId);
      }
      if (!identificador) {
        addIssue("error", "modulos", "MISSING_MODULE_IDENTIFIER", "El modulo no tiene identificador", moduloId);
      }

      const submodulos = Array.isArray(modulo.submodulos) ? modulo.submodulos : [];
      submodulos.forEach((submodulo, index) => {
        const source = submodulo as unknown as Record<string, unknown>;
        const submoduloId = String(source.submoduloId ?? `${moduloId}:${index}`);
        const submoduloTipo = String(source.tipo ?? "").trim();
        const submoduloNombre = String(source.nombre ?? "").trim();

        if (!submoduloNombre) {
          addIssue("error", "submodulos", "MISSING_SUBMODULE_NAME", "Un submodulo no tiene nombre", submoduloId);
        }
        if (!validSubmoduloTypes.has(submoduloTipo)) {
          addIssue(
            "error",
            "submodulos",
            "INVALID_SUBMODULE_TYPE",
            `El submodulo tiene tipo invalido: ${submoduloTipo || "sin tipo"}`,
            submoduloId,
          );
        }
      });
    });

    const pensionIds = new Set(pensiones.map((pension) => String(pension._id)));
    pensiones.forEach((pension) => {
      const validez = Array.isArray(pension.validez) ? pension.validez : [];
      if (validez.length !== 7) {
        addIssue(
          "error",
          "pensiones",
          "INVALID_PENSION_VALIDITY",
          "La pension no tiene validez para los 7 dias de la semana",
          String(pension._id),
        );
      }
    });

    pensionPasses.forEach((pensionPass) => {
      const pensionId = String(pensionPass.pension ?? "");
      if (!pensionIds.has(pensionId)) {
        addIssue(
          "error",
          "pensionPasses",
          "ORPHAN_PENSION_PASS",
          "El pension pass apunta a una pension que no existe en este LOCALOPE",
          String(pensionPass._id),
        );
      }
    });

    const profileIds = Array.from(
      new Set(
        usuarios
          .map((usuario) => String(usuario.permissionProfileId ?? "").trim())
          .filter(Boolean),
      ),
    );
    const profiles = profileIds.length > 0
      ? await PermissionProfileModel.find({ _id: { $in: profileIds } }).lean()
      : [];
    const profileIdSet = new Set(profiles.map((profile) => String(profile._id)));

    usuarios.forEach((usuario) => {
      const profileId = String(usuario.permissionProfileId ?? "").trim();
      if (profileId && !profileIdSet.has(profileId)) {
        addIssue(
          "warning",
          "usuarios",
          "MISSING_PERMISSION_PROFILE",
          "Un usuario apunta a un perfil de permisos que no existe localmente",
          String(usuario._id),
        );
      }
    });

    return {
      ok: errors.length === 0,
      checkedAt: Date.now(),
      errors,
      warnings,
      counts: {
        proyecto: proyecto ? 1 : 0,
        modulos: modulos.length,
        submodulos: modulos.reduce(
          (total, modulo) => total + (Array.isArray(modulo.submodulos) ? modulo.submodulos.length : 0),
          0,
        ),
        pensiones: pensiones.length,
        pensionPasses: pensionPasses.length,
        usuarios: usuarios.length,
        permissionProfiles: profiles.length,
      },
    };
  }

  private async recordAudit(payload: {
    actor: ConfigSyncActor;
    installationId: string;
    proyectoId: string;
    proyectoNombre: string;
    startedAt: number;
    status: SyncStatus;
    configurationVersion?: number | null;
    accessVersion?: number | null;
    counts?: Record<string, number>;
    integrity?: IntegrityResult;
    error?: unknown;
  }) {
    const finishedAt = Date.now();
    const error = payload.error as { message?: string; code?: string; details?: unknown } | undefined;

    await ConfigSyncAuditModel.create({
      installationId: payload.installationId,
      proyectoId: payload.proyectoId,
      proyectoNombre: payload.proyectoNombre,
      triggeredByUserId: payload.actor.userId ?? "",
      triggeredByUserName: payload.actor.userName ?? "",
      triggerSource: payload.actor.triggerSource ?? "manual",
      status: payload.status,
      startedAt: payload.startedAt,
      finishedAt,
      durationMs: finishedAt - payload.startedAt,
      configurationVersion: payload.configurationVersion ?? null,
      accessVersion: payload.accessVersion ?? null,
      counts: payload.counts ?? {},
      errorMessage: error?.message ?? "",
      errorCode: error?.code ?? "",
      metadata: {
        cloudApiUrl: envs.NUBEADMIN_API_URL,
        integrity: payload.integrity ?? null,
        errorDetails: error?.details ?? null,
      },
    });
  }
}
