import {
  type LocalUserList,
  type LocalUserSummary,
  AuthDatasource,
  type UserSyncMetadata,
} from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { AuthRepository } from "../../../domain/repositories/auth/auth.repository";

export class AuthRepositoryImpl implements AuthRepository {
  constructor(private readonly authDatasource: AuthDatasource) {}

  findByCorreo(correo: string): Promise<UsuarioEntity | null> {
    return this.authDatasource.findByCorreo(correo);
  }

  findByTelefono(telefono: string): Promise<UsuarioEntity | null> {
    return this.authDatasource.findByTelefono(telefono);
  }

  findById(id: string): Promise<UsuarioEntity | null> {
    return this.authDatasource.findById(id);
  }

  upsert(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    return this.authDatasource.upsert(usuario);
  }

  upsertFromAdministrativo(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    return this.authDatasource.upsertFromAdministrativo(usuario);
  }

  getSyncMetadataById(id: string): Promise<UserSyncMetadata | null> {
    return this.authDatasource.getSyncMetadataById(id);
  }

  listLocalUsers(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<LocalUserList> {
    return this.authDatasource.listLocalUsers(options);
  }

  findLocalUserSummaryById(id: string): Promise<LocalUserSummary | null> {
    return this.authDatasource.findLocalUserSummaryById(id);
  }
}
