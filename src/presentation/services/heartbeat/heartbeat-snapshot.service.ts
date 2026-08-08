import { envs } from "../../../config";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { DEVICE_HEARTBEAT_TIMEOUT_MS } from "../../sockets/device-socket.types";
import { InstallationIdentityService } from "../installation/installation-identity.service";

type HeartbeatStatus = "online" | "offline" | "pending";

const buildCloudUrl = (path: string) =>
  `${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}${path}`;

export class HeartbeatSnapshotService {
  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async buildSnapshot(proyectoId: string) {
    const proyecto = await this.proyectoRepository.findById(proyectoId);
    const modulos = await this.moduloRepository.getByProyecto(proyectoId);
    const now = Date.now();
    const installationId = await InstallationIdentityService.getInstallationId();

    const modules = modulos.map((modulo) => {
      const runtime = modulo.deviceRuntime;
      const hasPendingBinding = modulo.deviceBindingRequests.some(
        (request) => request.status === "PENDING",
      );
      const lastHeartbeatAt = runtime?.lastHeartbeatAt?.getTime() ?? 0;
      const heartbeatIsFresh =
        lastHeartbeatAt > 0 && now - lastHeartbeatAt <= DEVICE_HEARTBEAT_TIMEOUT_MS;
      const heartbeatStatus: HeartbeatStatus = !runtime
        ? "pending"
        : runtime.isConnected && runtime.isAuthorized && heartbeatIsFresh
          ? "online"
          : runtime.connectionStatus === "PENDING"
            ? "pending"
            : "offline";

      return {
        id: modulo.id,
        nombre: modulo.nombre,
        identificador: modulo.identificador,
        tipo: modulo.tipo,
        estado: modulo.estado,
        bindingStatus: modulo.deviceBinding
          ? "BOUND"
          : hasPendingBinding
            ? "PENDING"
            : "FREE",
        heartbeatStatus,
        message: runtime?.message ?? "",
        connectionStatus: runtime?.connectionStatus ?? "PENDING",
        isConnected: Boolean(runtime?.isConnected),
        isAuthorized: Boolean(runtime?.isAuthorized),
        lastHeartbeatAt: lastHeartbeatAt || null,
        lastDisconnectAt: runtime?.lastDisconnectAt?.getTime() ?? null,
        connectedAt: runtime?.connectedAt?.getTime() ?? null,
        deviceBinding: modulo.deviceBinding
          ? {
              fingerprint: modulo.deviceBinding.fingerprint,
              cpuSerial: modulo.deviceBinding.cpuSerial ?? "",
              machineId: modulo.deviceBinding.machineId ?? "",
              primaryMac: modulo.deviceBinding.primaryMac ?? "",
              boundAt: modulo.deviceBinding.boundAt?.getTime() ?? null,
              lastSeenAt: modulo.deviceBinding.lastSeenAt?.getTime() ?? null,
            }
          : null,
        deviceBindingRequests: modulo.deviceBindingRequests.map((request) => ({
          fingerprint: request.fingerprint,
          cpuSerial: request.cpuSerial ?? "",
          machineId: request.machineId ?? "",
          primaryMac: request.primaryMac ?? "",
          requestedAt: request.requestedAt?.getTime() ?? null,
          status: request.status,
          resolvedAt: request.resolvedAt?.getTime() ?? null,
          notes: request.notes ?? "",
        })),
        deviceConnectionAudit: modulo.deviceConnectionAudit
          ? {
              fingerprint: modulo.deviceConnectionAudit.fingerprint ?? "",
              socketId: modulo.deviceConnectionAudit.socketId ?? "",
              attemptedAt:
                modulo.deviceConnectionAudit.attemptedAt?.getTime() ?? null,
              ipAddress: modulo.deviceConnectionAudit.ipAddress ?? "",
              locationLabel: modulo.deviceConnectionAudit.locationLabel ?? "",
              status: modulo.deviceConnectionAudit.status,
              reason: modulo.deviceConnectionAudit.reason ?? "",
            }
          : null,
        submodules: modulo.submodulos.map((submodulo) => ({
          id: submodulo.submoduloId,
          nombre: submodulo.nombre,
          tipo: submodulo.tipo,
          estado: submodulo.estado,
          identificador: submodulo.identificador ?? "",
          ip: submodulo.ip ?? "",
          mac: submodulo.mac ?? "",
          descripcion: submodulo.descripcion ?? "",
        })),
      };
    });

    const lastHeartbeatAt = modules.reduce<number | null>((latest, modulo) => {
      if (!modulo.lastHeartbeatAt) return latest;
      if (!latest || modulo.lastHeartbeatAt > latest) return modulo.lastHeartbeatAt;
      return latest;
    }, null);

    return {
      project: {
        id: proyectoId,
        nombre: proyecto?.nombre ?? "",
        identificador: proyecto?.identificador ?? "",
      },
      snapshot: {
        proyectoId,
        generatedAt: now,
        source: "operativo-runtime",
        summary: {
          totalModules: modules.length,
          activeModules: modules.filter((modulo) => modulo.estado).length,
          onlineModules: modules.filter((modulo) => modulo.heartbeatStatus === "online").length,
          offlineModules: modules.filter((modulo) => modulo.heartbeatStatus === "offline").length,
          pendingModules: modules.filter((modulo) => modulo.heartbeatStatus === "pending").length,
          submodules: modules.reduce((total, modulo) => total + modulo.submodules.length, 0),
          staleThresholdMs: DEVICE_HEARTBEAT_TIMEOUT_MS,
          lastHeartbeatAt,
        },
        modules,
        metadata: {
          installationId,
          projectName: proyecto?.nombre ?? "",
          projectIdentifier: proyecto?.identificador ?? "",
        },
      },
    };
  }

  async syncSnapshot(proyectoId: string) {
    if (!envs.SYNC_SERVICE_TOKEN) return;

    try {
      const installationId = await InstallationIdentityService.getInstallationId();
      const { snapshot } = await this.buildSnapshot(proyectoId);
      const response = await fetch(buildCloudUrl("/api/sync/heartbeat-snapshot"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${envs.SYNC_SERVICE_TOKEN}`,
          "Content-Type": "application/json",
          "X-Viggo-Installation-Id": installationId,
        },
        body: JSON.stringify(snapshot),
      });

      if (!response.ok) {
        console.warn("[OPERATIVO heartbeat] No se pudo sincronizar snapshot:", {
          proyectoId,
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      console.warn("[OPERATIVO heartbeat] Error al sincronizar snapshot:", {
        proyectoId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
