import type { ModuloListQueryDto } from "../../../domain/dtos/parking/modulo-list-query.dto";
import { canAccessProject, type ProjectAccess } from "../../../domain/entities/auth/project-access";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";
import {
  DeviceConnectionAuditPayload,
  DeviceRegistrationPayload,
  DeviceRuntimePayload,
  ModuloFilters,
  ResolveDeviceBindingRequestPayload,
} from "./modulo-device-binding.types";
import { HeartbeatSnapshotService } from "../heartbeat/heartbeat-snapshot.service";
import { LocalInstallationService } from "../installation/local-installation.service";
import { ModuloCrudService } from "./modulo-crud.service";
import { ModuloDeviceLifecycleService } from "./modulo-device-lifecycle.service";
import type { RemoteSupportService } from "../remote-support/remote-support.service";

/** Lowercase without accents, for the free-text search. */
const normalizeText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export type DeviceBindingResolution = "RESET" | "APPROVED" | "REJECTED" | "PENDING";

export class ModuloService {
  private readonly queryService: ModuloCrudService;
  private readonly deviceLifecycleService: ModuloDeviceLifecycleService;
  private readonly heartbeatSnapshotService: HeartbeatSnapshotService;

  constructor(
    moduloRepository: ModuloRepository,
    proyectoRepository: ProyectoRepository,
    installations: LocalInstallationService,
    private readonly remoteSupport?: RemoteSupportService,
  ) {
    this.queryService = new ModuloCrudService(
      moduloRepository,
      proyectoRepository,
    );
    this.deviceLifecycleService = new ModuloDeviceLifecycleService(
      moduloRepository,
    );
    this.heartbeatSnapshotService = new HeartbeatSnapshotService(
      moduloRepository,
      proyectoRepository,
      installations,
    );
  }

  getModulos(): Promise<ModuloEntity[]> {
    return this.queryService.getModulos();
  }

  getModulosWithPendingDeviceBindingRequests(): Promise<ModuloEntity[]> {
    return this.queryService.getModulosWithPendingDeviceBindingRequests();
  }

  getModulosFiltered(filters: ModuloFilters): Promise<ModuloEntity[]> {
    return this.queryService.getModulosFiltered(filters);
  }

  getModuloById(id: string): Promise<ModuloEntity> {
    return this.queryService.getModuloById(id);
  }

  getModuloByIdentificador(identificador: string): Promise<ModuloEntity> {
    return this.queryService.getModuloByIdentificador(identificador);
  }

  getSubmodulos(id: string) {
    return this.queryService.getSubmodulos(id);
  }

  validateDeviceRegistration(
    id: string,
    device: DeviceRegistrationPayload,
  ): Promise<{ modulo: ModuloEntity; issuedDeviceSecret?: string }> {
    return this.deviceLifecycleService.validateDeviceRegistration(id, device);
  }

  approveDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.withHeartbeatSync(
      this.deviceLifecycleService.approveDeviceBindingRequest(id, payload),
    );
  }

  rejectDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.withHeartbeatSync(
      this.deviceLifecycleService.rejectDeviceBindingRequest(id, payload),
    );
  }

  reopenDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.withHeartbeatSync(
      this.deviceLifecycleService.reopenDeviceBindingRequest(id, payload),
    );
  }

  recordDeviceConnectionAudit(
    id: string,
    payload: DeviceConnectionAuditPayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.recordDeviceConnectionAudit(id, payload);
  }

  updateDeviceRuntime(
    id: string,
    payload: DeviceRuntimePayload,
  ): Promise<ModuloEntity> {
    return this.withHeartbeatSync(
      this.deviceLifecycleService.updateDeviceRuntime(id, payload),
    );
  }

  recordAuthorizedHeartbeat(
    id: string,
    payload: DeviceRegistrationPayload & { socketId?: string; message?: string },
  ): Promise<ModuloEntity> {
    return this.withHeartbeatSync(
      this.deviceLifecycleService.recordAuthorizedHeartbeat(id, payload),
    );
  }

  resetDeviceBinding(id: string): Promise<ModuloEntity> {
    return this.withHeartbeatSync(this.deviceLifecycleService.resetDeviceBinding(id));
  }

  getHeartbeatSnapshot(proyectoId: string) {
    return this.heartbeatSnapshotService.buildSnapshot(proyectoId);
  }

  syncHeartbeatSnapshot(proyectoId: string) {
    return this.heartbeatSnapshotService.syncSnapshot(proyectoId);
  }

  /** Modules of the user's parkings matching the filters and the free text. */
  async listModulos(query: ModuloListQueryDto, access: ProjectAccess): Promise<ModuloEntity[]> {
    if (query.proyecto) this.ensureAccess(access, query.proyecto);
    const scope = access.all ? undefined : access.allowed;
    // With one parking in scope the parking must exist (as when it is asked explicitly).
    const proyecto = query.proyecto || (scope?.length === 1 ? scope[0] : undefined);
    const modulos = await this.queryService.getModulosFiltered({ proyecto, proyectos: scope, tipos: query.tipos, estado: query.estado });
    if (!query.search) return modulos;
    const search = normalizeText(query.search);
    return modulos.filter((modulo) =>
      [modulo.nombre, modulo.identificador, modulo.descripcion ?? "", modulo.tipo].some((value) => normalizeText(String(value ?? "")).includes(search)));
  }

  async pendingBindings(access: ProjectAccess): Promise<ModuloEntity[]> {
    return (await this.queryService.getModulosWithPendingDeviceBindingRequests()).filter((modulo) => canAccessProject(access, modulo.proyecto));
  }

  /** A module of a parking the user can see (404 if it does not exist, 403 if not theirs). */
  async getAccessibleModulo(id: string, access: ProjectAccess): Promise<ModuloEntity> {
    const modulo = await this.queryService.getModuloById(id);
    this.ensureAccess(access, modulo.proyecto);
    return modulo;
  }

  async getAccessibleByIdentificador(identificador: string, access: ProjectAccess): Promise<ModuloEntity> {
    const modulo = await this.queryService.getModuloByIdentificador(identificador);
    this.ensureAccess(access, modulo.proyecto);
    return modulo;
  }

  async getAccessibleSubmodulos(id: string, access: ProjectAccess) {
    const modulo = await this.getAccessibleModulo(id, access);
    return this.queryService.getSubmodulos(modulo.id);
  }

  /**
   * Resolves a device binding request and tells the connected devices. Once approved, the
   * device is also looked up in remote support (in the background).
   */
  async resolveDeviceBinding(id: string, status: DeviceBindingResolution, payload: { fingerprint?: string; notes?: string }, access: ProjectAccess) {
    await this.getAccessibleModulo(id, access);
    const modulo = status === "RESET"
      ? await this.resetDeviceBinding(id)
      : status === "APPROVED"
        ? await this.approveDeviceBindingRequest(id, payload)
        : status === "REJECTED"
          ? await this.rejectDeviceBindingRequest(id, payload)
          : await this.reopenDeviceBindingRequest(id, payload);

    // Loaded here, not at import: the socket server itself builds a ModuloService when it loads.
    const { SocketServerPlugin } = await import("../../sockets/socket-server.js");
    SocketServerPlugin.emitDeviceBindingUpdated({
      moduleId: modulo.id,
      fingerprint: payload.fingerprint,
      status,
      reason: `${status}_DEVICE_BINDING`,
      timestamp: new Date().toISOString(),
    });

    if (status === "APPROVED" && this.remoteSupport) {
      void this.remoteSupport
        .resolveModuleDevice(id)
        .then((result) => (result.resolved && result.modulo?.proyecto ? this.syncHeartbeatSnapshot(result.modulo.proyecto) : undefined))
        .catch((error) => {
          console.warn("[OPERATIVO remote-support] No se pudo resolver el dispositivo remoto:", {
            moduleId: id,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
    }
    return modulo;
  }

  /** Finds the module's device in remote support; on success ADMIN gets the new state. */
  async resolveRemoteSupportDevice(id: string, access: ProjectAccess) {
    const remoteSupport = this.requireRemoteSupport();
    await this.getAccessibleModulo(id, access);
    const result = await remoteSupport.resolveModuleDevice(id);
    if (result.resolved && result.modulo?.proyecto) {
      void this.syncHeartbeatSnapshot(result.modulo.proyecto).catch((error) => {
        console.warn("[OPERATIVO remote-support] No se pudo sincronizar soporte remoto con ADMIN:", {
          moduleId: id,
          reason: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return result;
  }

  async createRemoteSupportSessionUrl(id: string, viewMode: unknown, access: ProjectAccess) {
    const remoteSupport = this.requireRemoteSupport();
    await this.getAccessibleModulo(id, access);
    return remoteSupport.createModuleSessionUrl(id, viewMode);
  }

  async createProjectRemoteSupportSessionUrl(projectId: string, access: ProjectAccess) {
    const remoteSupport = this.requireRemoteSupport();
    if (!projectId) throw CustomError.badRequest("projectId es requerido");
    this.ensureAccess(access, projectId);
    return remoteSupport.createProjectSessionUrl(projectId);
  }

  private requireRemoteSupport() {
    if (!this.remoteSupport) throw CustomError.serviceUnavailable("Servicio de soporte remoto no disponible");
    return this.remoteSupport;
  }

  private ensureAccess(access: ProjectAccess, projectId: string) {
    if (!canAccessProject(access, projectId)) throw CustomError.forbidden("Forbidden");
  }

  private async withHeartbeatSync(promise: Promise<ModuloEntity>) {
    const modulo = await promise;
    void this.heartbeatSnapshotService.syncSnapshot(modulo.proyecto);
    return modulo;
  }
}
