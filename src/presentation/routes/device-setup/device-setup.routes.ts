import { Router } from "express";
import { getModuloTypesRequiringDeviceBinding } from "../../../domain/entities/parking/module-type-capabilities.entity";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";
import { buildModuloRepository, buildProyectoRepository } from "../../dependencies";

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

const getProjectModules = async (modulos: ModuloRepository, projectId: string) => {
  const bindableTypes = new Set<string>(getModuloTypesRequiringDeviceBinding());
  const projectModules = await modulos.getByProyecto(projectId);
  return projectModules
    .filter((modulo) => modulo.estado !== false && bindableTypes.has(modulo.tipo))
    .sort((a, b) => byText(a.identificador, b.identificador) || byText(a.nombre, b.nombre));
};

const getActiveProjects = async (proyectos: ProyectoRepository) => {
  const all = await proyectos.getAll();
  return all.filter((proyecto) => proyecto.estado !== false).sort((a, b) => byText(a.nombre, b.nombre));
};

export class DeviceSetupRoutes {
  static get routes(): Router {
    const router = Router();
    const modulos = buildModuloRepository();
    const proyectos = buildProyectoRepository();

    router.get("/catalogs", async (_req, res) => {
      try {
        const activeProjects = await getActiveProjects(proyectos);
        const firstProjectId = activeProjects[0]?.id ?? "";
        const projectModules = firstProjectId ? await getProjectModules(modulos, firstProjectId) : [];

        return res.status(200).json({
          proyectos: activeProjects.map(serializeEntity),
          modulos: projectModules.map(serializeEntity),
        });
      } catch (error) {
        return res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "No se pudieron cargar catalogos de configuracion",
        });
      }
    });

    router.get("/proyectos/:projectId/modulos", async (req, res) => {
      try {
        const projectId = String(req.params.projectId || "").trim();
        if (!projectId) {
          return res.status(400).json({ error: "'projectId' es requerido" });
        }

        const projectModules = await getProjectModules(modulos, projectId);
        return res.status(200).json({ modulos: projectModules.map(serializeEntity) });
      } catch (error) {
        return res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "No se pudieron cargar modulos de configuracion",
        });
      }
    });

    return router;
  }
}
