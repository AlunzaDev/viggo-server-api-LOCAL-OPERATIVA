import { PensionEntity } from "../../../domain/entities/pension/pension.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";
import { PensionRepository } from "../../../domain/repository/pension/pension.repository";

/** Read-only plan projection. NUBEADMIN owns plan creation and commercial changes. */
export class PensionService {
  constructor(
    private readonly pensionRepository: PensionRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  getPensiones(): Promise<PensionEntity[]> {
    return this.pensionRepository.getAll();
  }

  async getPensionById(id: string): Promise<PensionEntity> {
    const pension = await this.pensionRepository.findById(id);
    if (!pension) throw CustomError.notFound("Pension no encontrada");
    return pension;
  }

  async getPensionesByProyecto(proyectoId: string): Promise<PensionEntity[]> {
    const proyecto = await this.proyectoRepository.findById(proyectoId);
    if (!proyecto) throw CustomError.notFound("Proyecto no encontrado");
    return this.pensionRepository.getByProyecto(proyectoId);
  }
}
