import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import {
  AuthDatasource,
  type UserSyncMetadata,
} from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";

export class AuthMongoDatasource extends AuthDatasource {
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

  async upsertFromNubeadmin(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    const { id, ...payload } = usuario;
    const now = Date.now();
    const document = await UsuarioModel.findByIdAndUpdate(
      id,
      {
        ...payload,
        syncSource: "nubeadmin",
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
      syncSource: document.syncSource === "local" ? "local" : "nubeadmin",
      lastSyncedAt:
        typeof document.lastSyncedAt === "number" ? document.lastSyncedAt : undefined,
      lastCloudCheckAt:
        typeof document.lastCloudCheckAt === "number"
          ? document.lastCloudCheckAt
          : undefined,
    };
  }
}
