import { RemoteSupportProvider } from "../../../domain/entities/parking/remote-support.entity";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { MeshCentralDeviceResolverService } from "./meshcentral-device-resolver.service";
import { RemoteSupportProviderAdapter } from "./remote-support-provider-adapter";
import { MeshCentralSessionUrlService } from "./meshcentral-session-url.service";

export class RemoteSupportService {
  private readonly meshCentralDeviceResolver: MeshCentralDeviceResolverService;
  private readonly meshCentralSessionUrl: MeshCentralSessionUrlService;

  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {
    this.meshCentralDeviceResolver = new MeshCentralDeviceResolverService(
      moduloRepository,
      proyectoRepository,
    );
    this.meshCentralSessionUrl = new MeshCentralSessionUrlService(
      moduloRepository,
      proyectoRepository,
    );
  }

  async resolveModuleDevice(moduleId: string) {
    const adapter = await this.getAdapterForModule(moduleId);
    return adapter.resolveModuleDevice(moduleId);
  }

  async createModuleSessionUrl(moduleId: string, viewModeInput: unknown = 10) {
    const adapter = await this.getAdapterForModule(moduleId);
    return adapter.createModuleSessionUrl(moduleId, viewModeInput);
  }

  private async getAdapterForModule(
    moduleId: string,
  ): Promise<RemoteSupportProviderAdapter> {
    const modulo = await this.moduloRepository.findById(moduleId);
    if (!modulo) {
      throw new Error("Modulo no encontrado");
    }

    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);
    const provider = (modulo.remoteSupport?.provider ||
      proyecto?.remoteSupport?.provider ||
      "MESHCENTRAL") as RemoteSupportProvider;

    if (provider === "MESHCENTRAL") {
      return {
        resolveModuleDevice: (id) =>
          this.meshCentralDeviceResolver.resolveModuleDevice(id),
        createModuleSessionUrl: (id, viewMode) =>
          this.meshCentralSessionUrl.createModuleSessionUrl(id, viewMode),
      };
    }

    throw new Error(
      `El proveedor de soporte remoto '${provider}' aun no tiene adaptador operativo`,
    );
  }
}
