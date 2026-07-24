import {
  AuthDatasource,
  type UserSyncMetadata,
} from "../../../domain/datasources/auth/auth.datasource";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";

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

  upsertFromNubeadmin(usuario: UsuarioEntity): Promise<UsuarioEntity> {
    return this.authDatasource.upsertFromNubeadmin(usuario);
  }

  getSyncMetadataById(id: string): Promise<UserSyncMetadata | null> {
    return this.authDatasource.getSyncMetadataById(id);
  }
}
