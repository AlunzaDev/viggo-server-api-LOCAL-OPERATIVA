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
import { ModuloCrudService } from "./modulo-crud.service";
import { ModuloDeviceLifecycleService } from "./modulo-device-lifecycle.service";

export class ModuloService {
  private readonly queryService: ModuloCrudService;
  private readonly deviceLifecycleService: ModuloDeviceLifecycleService;

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
    return this.deviceLifecycleService.approveDeviceBindingRequest(id, payload);
  }

  rejectDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.rejectDeviceBindingRequest(id, payload);
  }

  reopenDeviceBindingRequest(
    id: string,
    payload: ResolveDeviceBindingRequestPayload,
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.reopenDeviceBindingRequest(id, payload);
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
    return this.deviceLifecycleService.updateDeviceRuntime(id, payload);
  }

  recordAuthorizedHeartbeat(
    id: string,
    payload: DeviceRegistrationPayload & { socketId?: string; message?: string },
  ): Promise<ModuloEntity> {
    return this.deviceLifecycleService.recordAuthorizedHeartbeat(id, payload);
  }

  resetDeviceBinding(id: string): Promise<ModuloEntity> {
    return this.deviceLifecycleService.resetDeviceBinding(id);
  }
}
