import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import {
  DeviceConnectionAuditPayload,
  DeviceRegistrationPayload,
  DeviceRuntimePayload,
  ModuloFilters,
  ResolveDeviceBindingRequestPayload,
} from "./modulo-device-binding.types";
import { HeartbeatSnapshotService } from "../heartbeat/heartbeat-snapshot.service";
import { ModuloCrudService } from "./modulo-crud.service";
import { ModuloDeviceLifecycleService } from "./modulo-device-lifecycle.service";

export class ModuloService {
  private readonly queryService: ModuloCrudService;
  private readonly deviceLifecycleService: ModuloDeviceLifecycleService;
  private readonly heartbeatSnapshotService: HeartbeatSnapshotService;

  constructor(
    moduloRepository: ModuloRepository,
    proyectoRepository: ProyectoRepository,
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

  private async withHeartbeatSync(promise: Promise<ModuloEntity>) {
    const modulo = await promise;
    void this.heartbeatSnapshotService.syncSnapshot(modulo.proyecto);
    return modulo;
  }
}
