import { UsuarioEntity } from "../../entities/auth/usuario.entity";

export type UserSyncMetadata = {
  syncSource: "administrativo" | "local";
  lastSyncedAt?: number;
  lastCloudCheckAt?: number;
};

export type LocalUserSummary = {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  rol: UsuarioEntity["rol"];
  estado: boolean;
  parkings: string[];
  allowedApps: UsuarioEntity["allowedApps"];
  appPermissions: UsuarioEntity["appPermissions"];
};

export type LocalUserList = {
  usuarios: LocalUserSummary[];
  total: number;
  page: number;
  limit: number;
};

export abstract class AuthDatasource {
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
