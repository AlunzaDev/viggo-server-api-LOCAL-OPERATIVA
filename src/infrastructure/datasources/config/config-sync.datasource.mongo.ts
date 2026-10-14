import {
  ConfigSyncAuditModel,
  ModuloModel,
  PensionModel,
  PensionPassModel,
  PermissionProfileModel,
  ProyectoModel,
  UsuarioModel,
} from "../../../data/mongo";
import { USER_APPS } from "../../../domain/constants";
import {
  ConfigSyncDatasource,
  type ConfigIntegritySnapshot,
  type ConfigSyncAuditInput,
} from "../../../domain/datasources/config/config-sync.datasource";

export class ConfigSyncMongoDatasource implements ConfigSyncDatasource {
  async getIntegritySnapshot(proyectoId: string): Promise<ConfigIntegritySnapshot> {
    const [proyecto, modulos, pensiones, pensionPasses, usuarios] = await Promise.all([
      ProyectoModel.exists({ _id: proyectoId }),
      ModuloModel.find({ proyecto: proyectoId }).lean(),
      PensionModel.find({ proyecto: proyectoId }).lean(),
      PensionPassModel.find().lean(),
      UsuarioModel.find({ $or: [{ parkings: proyectoId }, { rol: "SUPER_ROLE" }] }).lean(),
    ]);

    return {
      proyectoExists: Boolean(proyecto),
      modulos: modulos.map((modulo) => ({
        id: String(modulo._id),
        tipo: String(modulo.tipo ?? "").trim(),
        identificador: String(modulo.identificador ?? "").trim(),
        submodulos: (Array.isArray(modulo.submodulos) ? modulo.submodulos : []).map((submodulo) => {
          const source = submodulo as unknown as Record<string, unknown>;
          return {
            submoduloId: source.submoduloId ? String(source.submoduloId) : undefined,
            tipo: String(source.tipo ?? "").trim(),
            nombre: String(source.nombre ?? "").trim(),
          };
        }),
      })),
      pensiones: pensiones.map((pension) => ({
        id: String(pension._id),
        validezDays: Array.isArray(pension.validez) ? pension.validez.length : 0,
      })),
      pensionPasses: pensionPasses.map((pensionPass) => ({
        id: String(pensionPass._id),
        pensionId: String(pensionPass.pension ?? ""),
      })),
      usuarios: usuarios.map((usuario) => {
        const appPermissions = Array.isArray(usuario.appPermissions) ? usuario.appPermissions : [];
        const assignment = appPermissions.find((permission) => permission.app === USER_APPS.OPERATIVE_WEB);
        return {
          id: String(usuario._id),
          operativeProfileId: String(assignment?.permissionProfileId ?? "").trim(),
        };
      }),
    };
  }

  async findExistingPermissionProfileIds(ids: string[], app: string) {
    if (ids.length === 0) return [];
    const profiles = await PermissionProfileModel.find({ _id: { $in: ids }, app }).select({ _id: 1 }).lean();
    return profiles.map((profile) => String(profile._id));
  }

  async recordAudit(audit: ConfigSyncAuditInput) {
    await ConfigSyncAuditModel.create(audit);
  }

  getAuditHistory(limit: number) {
    return ConfigSyncAuditModel.find().sort({ startedAt: -1 }).limit(limit).lean() as Promise<
      Record<string, unknown>[]
    >;
  }
}
