import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";

/** Read-only local projection. NUBEADMIN owns project creation and updates. */
export class ProyectoService {
  constructor(private readonly proyectoRepository: ProyectoRepository) {}

  getProyectos(): Promise<ProyectoEntity[]> {
    return this.proyectoRepository.getAll();
  }

  async getProyectoById(id: string): Promise<ProyectoEntity> {
    const proyecto = await this.proyectoRepository.findById(id);
    if (!proyecto) throw CustomError.notFound("Proyecto no encontrado");
    return proyecto;
  }
}
