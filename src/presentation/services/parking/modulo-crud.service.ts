import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloEntity, ModuloSubmodulo } from "../../../domain/entities/parking/modulo.entity";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";
import { ModuloFilters } from "./modulo-device-binding.types";

/** Read-only access to module configuration synchronized from ADMINISTRATIVO. */
export class ModuloCrudService {
  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  getModulos(): Promise<ModuloEntity[]> {
    return this.moduloRepository.getAll();
  }

  getModulosWithPendingDeviceBindingRequests(): Promise<ModuloEntity[]> {
    return this.moduloRepository.getWithPendingDeviceBindingRequests();
  }

  async getModulosFiltered(filters: ModuloFilters): Promise<ModuloEntity[]> {
    if (filters.proyecto) {
      const proyecto = await this.proyectoRepository.findById(filters.proyecto);
      if (!proyecto) throw CustomError.notFound("Proyecto no encontrado");
    }
    return this.moduloRepository.getFiltered(filters);
  }

  async getModuloById(id: string): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findById(id);
    if (!modulo) throw CustomError.notFound("Modulo no encontrado");
    return modulo;
  }

  async getModuloByIdentificador(identificador: string): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findByIdentificador(identificador);
    if (!modulo) throw CustomError.notFound("Modulo no encontrado");
    return modulo;
  }

  async getSubmodulos(id: string): Promise<ModuloSubmodulo[]> {
    await this.getModuloById(id);
    const submodulos = await this.moduloRepository.getSubmodulos(id);
    if (!submodulos) throw CustomError.notFound("Modulo no encontrado");
    return submodulos;
  }
}
