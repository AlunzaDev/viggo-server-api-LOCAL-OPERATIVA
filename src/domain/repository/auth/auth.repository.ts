import { UsuarioEntity } from "../../entities/auth/usuario.entity";
import type { UserSyncMetadata } from "../../datasources/auth/auth.datasource";

export abstract class AuthRepository {
  abstract findByCorreo(correo: string): Promise<UsuarioEntity | null>;
  abstract findByTelefono(telefono: string): Promise<UsuarioEntity | null>;
  abstract findById(id: string): Promise<UsuarioEntity | null>;
  abstract upsert(usuario: UsuarioEntity): Promise<UsuarioEntity>;
  abstract upsertFromNubeadmin(usuario: UsuarioEntity): Promise<UsuarioEntity>;
  abstract getSyncMetadataById(id: string): Promise<UserSyncMetadata | null>;
}
