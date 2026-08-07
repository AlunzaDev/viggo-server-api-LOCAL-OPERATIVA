import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import {
  AuthDatasource,
  type LocalUserList,
  type LocalUserSummary,
  type UserSyncMetadata,
} from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";

export class AuthMongoDatasource extends AuthDatasource {
  private toLocalUserSummary(document: Record<string, unknown>): LocalUserSummary {
    const user = UsuarioEntity.fromObject(document);
    return {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      correo: user.correo,
      telefono: user.telefono,
      rol: user.rol,
      estado: user.estado,
      parkings: [...user.parkings],
      allowedApps: [...user.allowedApps],
      appPermissions: user.appPermissions.map((permission) => ({ ...permission })),
    };
  }

  async findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    const document = await UsuarioModel.findOne({ correo });
    return document ? UsuarioEntity.fromObject(document.toObject()) : null;
  }

  async findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    const document = await UsuarioModel.findOne({ telefono });
    return document ? UsuarioEntity.fromObject(document.toObject()) : null;
  }

  async findById(id: string): Promise<UsuarioEntity | null> {
    const document = await UsuarioModel.findById(id);
    return document ? UsuarioEntity.fromObject(document.toObject()) : null;
  }

  async upsert(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    const { id, ...payload } = usuario;
    const document = await UsuarioModel.findByIdAndUpdate(id, payload, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });
    return UsuarioEntity.fromObject(document.toObject());
  }

  async upsertFromAdministrativo(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    const { id, ...payload } = usuario;
    const now = Date.now();
    const document = await UsuarioModel.findByIdAndUpdate(
      id,
      {
        ...payload,
        syncSource: "administrativo",
        lastSyncedAt: now,
        lastCloudCheckAt: now,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
    return UsuarioEntity.fromObject(document.toObject());
  }

  async getSyncMetadataById(id: string): Promise<UserSyncMetadata | null> {
    const document = await UsuarioModel.findById(id)
      .select("syncSource lastSyncedAt lastCloudCheckAt")
      .lean();

    if (!document) return null;

    return {
      syncSource:
        document.syncSource === "local" ? "local" : "administrativo",
      lastSyncedAt:
        typeof document.lastSyncedAt === "number" ? document.lastSyncedAt : undefined,
      lastCloudCheckAt:
        typeof document.lastCloudCheckAt === "number"
          ? document.lastCloudCheckAt
          : undefined,
    };
  }

  async listLocalUsers(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<LocalUserList> {
    const search = options.search?.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = search
      ? {
          $or: [
            { nombre: { $regex: search, $options: "i" } },
            { apellido: { $regex: search, $options: "i" } },
            { correo: { $regex: search, $options: "i" } },
            { telefono: { $regex: search, $options: "i" } },
          ],
        }
      : {};
    const [documents, total] = await Promise.all([
      UsuarioModel.find(filter)
        .sort({ nombre: 1, apellido: 1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .lean(),
      UsuarioModel.countDocuments(filter),
    ]);
    return {
      usuarios: documents.map((document) =>
        this.toLocalUserSummary(document as Record<string, unknown>),
      ),
      total,
      page: options.page,
      limit: options.limit,
    };
  }

  async findLocalUserSummaryById(id: string): Promise<LocalUserSummary | null> {
    const document = await UsuarioModel.findById(id).lean();
    return document
      ? this.toLocalUserSummary(document as Record<string, unknown>)
      : null;
  }
}
