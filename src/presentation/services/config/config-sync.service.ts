import { SUBMODULE_TYPES } from "@alunzadev/viggo-contracts";
import { envs } from "../../../config";
import type { ConfigSyncStatus } from "../../../domain/datasources/config/config-sync.datasource";
import type {
  AccessSnapshotResult,
  ConfigurationSnapshotResult,
} from "../../../domain/datasources/sync/sync.datasource";
import { TransactionRunner, type TransactionContext } from "../../../domain/datasources/system/transaction";
import { ConfigSyncRepository } from "../../../domain/repositories/config/config-sync.repository";
import { CustomError } from "../../../domain/errors/custom.error";
import { InstallationIdentityService } from "../installation/installation-identity.service";
import { LocalInstallationService } from "../installation/local-installation.service";
import { SyncService } from "../sync/sync.service";
import { USER_APPS } from "../../../domain/constants";
import { parseModuloTipo } from "../../../domain/entities/parking/module-type.entity";

type CloudResponse = Record<string, unknown>;
type SyncStatus = ConfigSyncStatus;
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
/** A snapshot whose version was already applied: zero counts, no details. */
type Skipped<T> = Omit<T, "details"> & { skipped: true; reason: string };
export type ConfigSyncActor = {
  userId?: string;
  userName?: string;
  triggerSource?: "manual" | "automatic" | "system";
};

const cloudUrl = (path: string) =>
  `${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}${path}`;

export class ConfigSyncService {
  constructor(
    private readonly localInstallationService: LocalInstallationService,
    private readonly syncService: SyncService,
    private readonly configSync: ConfigSyncRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async getStatus() {
    const installation = await this.localInstallationService.findDefault();

    return {
      cloudApiUrl: envs.ADMINISTRATIVO_API_URL,
      installationId: await InstallationIdentityService.getInstallationId(),
      configured:
        installation?.status === "linked" && Boolean(installation.proyectoId),
      proyectoId: installation?.proyectoId ?? null,
      proyectoNombre: installation?.proyectoNombre ?? null,
      proyectoIdentificador: installation?.proyectoIdentificador ?? null,
      lastLocalUpdateAt: installation?.updatedAt ?? null,
      lastConfigurationVersion: installation?.lastConfigurationVersion ?? null,
      lastAccessVersion: installation?.lastAccessVersion ?? null,
      lastSyncAt: installation?.lastSyncAt ?? null,
      lastSyncStatus: installation?.lastSyncStatus ?? null,
      lastSyncError: installation?.lastSyncError ?? "",
      syncTokenConfigured: Boolean(await InstallationIdentityService.getCloudCredentials()),
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
        throw CustomError.badRequest(
          "La instalacion local aun no esta vinculada a un proyecto",
        );
      }

      const [configuration, access] = await Promise.all([
        this.fetchCloud(`/api/sync/configuration/${proyectoId}`),
        this.fetchCloud(`/api/sync/access-snapshot/${proyectoId}`),
      ]);

      const configurationVersion = Number(configuration.version ?? 0) || null;
      const accessVersion = Number(access.version ?? 0) || null;
      const configurationAlreadyApplied =
        configurationVersion !== null &&
        Number(installation.lastConfigurationVersion ?? 0) ===
          configurationVersion;
      const accessAlreadyApplied =
        accessVersion !== null &&
        Number(installation.lastAccessVersion ?? 0) === accessVersion;

      // Both snapshots and the integrity check run in one transaction: if the result is
      // inconsistent nothing is kept and the previous configuration stays in place.
      const { configurationResult, accessResult, integrity } = await this.transactions.run(async (tx) => {
        const configurationResult: ConfigurationSnapshotResult | Skipped<ConfigurationSnapshotResult> = configurationAlreadyApplied
          ? {
              proyecto: 0,
              modulos: 0,
              pensiones: 0,
              pensionPasses: 0,
              skipped: true,
              reason: "VERSION_ALREADY_APPLIED",
            }
          : await this.syncService.applyConfigurationSnapshot({
              proyecto:
                (configuration.proyecto as
                  | Record<string, unknown>
                  | undefined) ?? null,
              modulos: Array.isArray(configuration.modulos)
                ? (configuration.modulos as Record<string, unknown>[])
                : [],
              pensiones: Array.isArray(configuration.pensiones)
                ? (configuration.pensiones as Record<string, unknown>[])
                : [],
              pensionPasses: Array.isArray(configuration.pensionPasses)
                ? (configuration.pensionPasses as Record<string, unknown>[])
                : [],
            }, tx);
        const accessResult: AccessSnapshotResult | Skipped<AccessSnapshotResult> = accessAlreadyApplied
          ? {
              users: 0,
              permissionProfiles: 0,
              skipped: true,
              reason: "VERSION_ALREADY_APPLIED",
            }
          : await this.syncService.applyAccessSnapshot({
              users: Array.isArray(access.users)
                ? (access.users as Record<string, unknown>[])
                : [],
              permissionProfiles: Array.isArray(access.permissionProfiles)
                ? (access.permissionProfiles as Record<string, unknown>[])
                : [],
            }, tx);
        const integrity = await this.validateLocalIntegrity(proyectoId, tx);

        if (integrity.errors.length > 0) {
          throw CustomError.badRequest(
            "La sincronizacion dejo inconsistencias locales",
            { integrity },
            "SYNC_INTEGRITY_FAILED",
          );
        }
        return { configurationResult, accessResult, integrity };
      });

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
          proyecto: configurationResult.proyecto,
          modulos: configurationResult.modulos,
          pensiones: configurationResult.pensiones,
          pensionPasses: configurationResult.pensionPasses,
          users: accessResult.users,
          permissionProfiles: accessResult.permissionProfiles,
        },
        integrity,
      });

      return result;
    } catch (error) {
      await this.localInstallationService.updateSyncState({
        lastSyncAt: Date.now(),
        lastSyncStatus: "failed",
        lastSyncError:
          error instanceof Error ? error.message : "Error desconocido",
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
    return this.configSync.getAuditHistory(safeLimit);
  }

  private async fetchCloud(path: string): Promise<CloudResponse> {
    const credentials = await InstallationIdentityService.getCloudCredentials();
    if (!credentials) {
      throw CustomError.badRequest(
        "La instalacion no tiene credenciales de la nube; vinculala de nuevo",
        undefined,
        "INSTALLATION_NOT_LINKED",
      );
    }
    let response: Response;

    try {
      response = await fetch(cloudUrl(path), {
        headers: InstallationIdentityService.cloudHeaders(credentials),
      });
      InstallationIdentityService.handleCloudResponse(response);
    } catch {
      throw CustomError.internalServer(
        "La nube no esta disponible",
        { cloudApiUrl: envs.ADMINISTRATIVO_API_URL },
        "ADMINISTRATIVO_UNAVAILABLE",
      );
    }

    const data = (await response.json().catch(() => ({}))) as CloudResponse;
    if (!response.ok) {
      throw CustomError.badRequest(
        String(
          data.error ?? data.message ?? "No se pudo sincronizar con la nube",
        ),
        { status: response.status },
        "ADMINISTRATIVO_SYNC_FAILED",
      );
    }

    return data;
  }

  private async validateLocalIntegrity(
    proyectoId: string,
    tx?: TransactionContext,
  ): Promise<IntegrityResult> {
    const errors: IntegrityIssue[] = [];
    const warnings: IntegrityIssue[] = [];
    const validSubmoduloTypes = new Set<string>(SUBMODULE_TYPES);

    const { proyectoExists, modulos, pensiones, pensionPasses, usuarios } =
      await this.configSync.getIntegritySnapshot(proyectoId, tx);

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

    if (!proyectoExists) {
      addIssue(
        "error",
        "proyecto",
        "PROJECT_NOT_FOUND",
        "El proyecto vinculado no existe en esta instalacion",
        proyectoId,
      );
    }

    if (modulos.length === 0) {
      addIssue(
        "warning",
        "modulos",
        "NO_MODULES",
        "El proyecto no tiene modulos locales sincronizados",
        proyectoId,
      );
    }

    modulos.forEach((modulo) => {
      const moduloId = modulo.id;
      const { tipo, identificador } = modulo;

      if (!parseModuloTipo(tipo)) {
        addIssue(
          "error",
          "modulos",
          "INVALID_MODULE_TYPE",
          `El modulo tiene tipo invalido: ${tipo || "sin tipo"}`,
          moduloId,
        );
      }
      if (!identificador) {
        addIssue(
          "error",
          "modulos",
          "MISSING_MODULE_IDENTIFIER",
          "El modulo no tiene identificador",
          moduloId,
        );
      }

      modulo.submodulos.forEach((submodulo, index) => {
        const submoduloId = submodulo.submoduloId ?? `${moduloId}:${index}`;
        const submoduloTipo = submodulo.tipo;
        const submoduloNombre = submodulo.nombre;

        if (!submoduloNombre) {
          addIssue(
            "error",
            "submodulos",
            "MISSING_SUBMODULE_NAME",
            "Un submodulo no tiene nombre",
            submoduloId,
          );
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

    const pensionIds = new Set(pensiones.map((pension) => pension.id));
    pensiones.forEach((pension) => {
      if (pension.validezDays !== 7) {
        addIssue(
          "error",
          "pensiones",
          "INVALID_PENSION_VALIDITY",
          "La pension no tiene validez para los 7 dias de la semana",
          pension.id,
        );
      }
    });

    pensionPasses.forEach((pensionPass) => {
      if (!pensionIds.has(pensionPass.pensionId)) {
        addIssue(
          "error",
          "pensionPasses",
          "ORPHAN_PENSION_PASS",
          "El pension pass apunta a una pension que no existe en esta instalacion",
          pensionPass.id,
        );
      }
    });

    const profileIds = Array.from(
      new Set(usuarios.map((usuario) => usuario.operativeProfileId).filter(Boolean)),
    );
    const existingProfileIds = await this.configSync.findExistingPermissionProfileIds(
      profileIds,
      USER_APPS.OPERATIVE_WEB,
      tx,
    );
    const profileIdSet = new Set(existingProfileIds);

    usuarios.forEach((usuario) => {
      const profileId = usuario.operativeProfileId;

      if (profileId && !profileIdSet.has(profileId)) {
        addIssue(
          "warning",
          "usuarios",
          "MISSING_PERMISSION_PROFILE",
          "Un usuario apunta a un perfil de permisos operativo que no existe localmente",
          usuario.id,
        );
      }
    });

    return {
      ok: errors.length === 0,
      checkedAt: Date.now(),
      errors,
      warnings,
      counts: {
        proyecto: proyectoExists ? 1 : 0,
        modulos: modulos.length,
        submodulos: modulos.reduce(
          (total, modulo) => total + modulo.submodulos.length,
          0,
        ),
        pensiones: pensiones.length,
        pensionPasses: pensionPasses.length,
        usuarios: usuarios.length,
        permissionProfiles: existingProfileIds.length,
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
    const error = payload.error as
      | { message?: string; code?: string; details?: unknown }
      | undefined;

    await this.configSync.recordAudit({
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
        cloudApiUrl: envs.ADMINISTRATIVO_API_URL,
        integrity: payload.integrity ?? null,
        errorDetails: error?.details ?? null,
      },
    });
  }
}
