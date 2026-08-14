import { Router } from "express";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { getModuloTypesRequiringDeviceBinding } from "../../../domain/entities/parking/module-type-capabilities.entity";

const serializeDocument = (document: unknown): Record<string, unknown> => {
  if (!document || typeof document !== "object") return {};

  const source =
    "toObject" in document && typeof document.toObject === "function"
      ? document.toObject()
      : document;

  const serialized = { ...(source as Record<string, unknown>) };
  if (serialized._id) {
    serialized.id = String(serialized._id);
    serialized._id = String(serialized._id);
  }

  return serialized;
};

const getProjectModules = (projectId: string) =>
  ModuloModel.find({
    proyecto: projectId,
    estado: { $ne: false },
    tipo: { $in: getModuloTypesRequiringDeviceBinding() },
  }).sort({ identificador: 1, nombre: 1 });

export class DeviceSetupRoutes {
  static get routes(): Router {
    const router = Router();

    router.get("/catalogs", async (_req, res) => {
      try {
        const proyectos = await ProyectoModel.find({ estado: { $ne: false } }).sort({
          nombre: 1,
        });
        const firstProjectId = proyectos[0]?._id ? String(proyectos[0]._id) : "";
        const modulos = firstProjectId ? await getProjectModules(firstProjectId) : [];

        return res.status(200).json({
          proyectos: proyectos.map(serializeDocument),
          modulos: modulos.map(serializeDocument),
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

        const modulos = await getProjectModules(projectId);
        return res.status(200).json({ modulos: modulos.map(serializeDocument) });
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
