import { getModuloTypesRequiringDeviceBinding } from "../../../domain/entities/parking/module-type-capabilities.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import type { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import type { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";

// The device setup app (expendedora) reads the ids from `_id`, so both keys are sent.
const serializeEntity = (entity: { id: string }): Record<string, unknown> => ({
  ...entity,
  _id: entity.id,
});

const byText = (a: string | undefined, b: string | undefined) => {
  const left = a ?? "";
  const right = b ?? "";
  return left < right ? -1 : left > right ? 1 : 0;
};

/** What the device setup app offers: active parkings and the modules a device can bind to. */
export class DeviceSetupService {
  constructor(
    private readonly proyectos: ProyectoRepository,
    private readonly modulos: ModuloRepository,
  ) {}

  /** Active parkings, and the modules of the first one so the form starts filled. */
  async catalogs() {
    const activeProjects = await this.activeProjects();
    const firstProjectId = activeProjects[0]?.id ?? "";
    const projectModules = firstProjectId ? await this.bindableModules(firstProjectId) : [];
    return { proyectos: activeProjects.map(serializeEntity), modulos: projectModules.map(serializeEntity) };
  }

  async projectModules(projectId: string) {
    if (!projectId) throw CustomError.badRequest("'projectId' es requerido");
    return { modulos: (await this.bindableModules(projectId)).map(serializeEntity) };
  }

  private async bindableModules(projectId: string) {
    const bindableTypes = new Set<string>(getModuloTypesRequiringDeviceBinding());
    const projectModules = await this.modulos.getByProyecto(projectId);
    return projectModules
      .filter((modulo) => modulo.estado !== false && bindableTypes.has(modulo.tipo))
      .sort((a, b) => byText(a.identificador, b.identificador) || byText(a.nombre, b.nombre));
  }

  private async activeProjects() {
    const all = await this.proyectos.getAll();
    return all.filter((proyecto) => proyecto.estado !== false).sort((a, b) => byText(a.nombre, b.nombre));
  }
}
