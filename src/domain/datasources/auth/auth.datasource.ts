import { UsuarioEntity } from "../../entities/auth/usuario.entity";

export abstract class AuthDatasource {
  abstract findByCorreo(correo: string): Promise<UsuarioEntity | null>;
  abstract findByTelefono(telefono: string): Promise<UsuarioEntity | null>;
  abstract findById(id: string): Promise<UsuarioEntity | null>;
}
