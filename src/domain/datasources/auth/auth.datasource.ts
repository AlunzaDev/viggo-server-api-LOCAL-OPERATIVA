import { UsuarioEntity } from "../../entities/auth/usuario.entity";

export type UserSyncMetadata = {
  syncSource: "nubeadmin" | "local";
  lastSyncedAt?: number;
  lastCloudCheckAt?: number;
};

export abstract class AuthDatasource {
  abstract findByCorreo(correo: string): Promise<UsuarioEntity | null>;
  abstract findByTelefono(telefono: string): Promise<UsuarioEntity | null>;
  abstract findById(id: string): Promise<UsuarioEntity | null>;
  abstract upsert(usuario: UsuarioEntity): Promise<UsuarioEntity>;
  abstract upsertFromNubeadmin(usuario: UsuarioEntity): Promise<UsuarioEntity>;
  abstract getSyncMetadataById(id: string): Promise<UserSyncMetadata | null>;
}
