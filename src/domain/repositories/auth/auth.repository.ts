import { UsuarioEntity } from "../../entities/auth/usuario.entity";
import type {
  LocalUserList,
  LocalUserSummary,
  UserSyncMetadata,
} from "../../datasources/auth/auth.datasource";

export abstract class AuthRepository {
  abstract findByCorreo(correo: string): Promise<UsuarioEntity | null>;
  abstract findByTelefono(telefono: string): Promise<UsuarioEntity | null>;
  abstract findById(id: string): Promise<UsuarioEntity | null>;
  abstract updateBarrierBlasterHighScore(
    id: string,
    score: number,
  ): Promise<UsuarioEntity | null>;
  abstract upsert(usuario: UsuarioEntity): Promise<UsuarioEntity>;
  abstract upsertFromAdministrativo(usuario: UsuarioEntity): Promise<UsuarioEntity>;
  abstract getSyncMetadataById(id: string): Promise<UserSyncMetadata | null>;
  abstract listLocalUsers(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<LocalUserList>;
  abstract findLocalUserSummaryById(id: string): Promise<LocalUserSummary | null>;
}
