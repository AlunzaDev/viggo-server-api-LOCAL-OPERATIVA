import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async loginCorreo(
    correo: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByCorreo(correo);
    return this.login(usuario, password);
  }

  async loginTelefono(
    telefono: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByTelefono(telefono);
    return this.login(usuario, password);
  }

  async renewToken(
    id: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findById(id);
    if (!usuario) throw CustomError.unauthorized("Usuario no encontrado");

    this.ensureUserCanOperate(usuario);
    return this.issueSession(usuario);
  }

  private async login(
    usuario: UsuarioEntity | null,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    if (!usuario || !bcryptPlugin.compare(password, usuario.password)) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    this.ensureUserCanOperate(usuario);
    return this.issueSession(usuario);
  }

  private ensureUserCanOperate(usuario: UsuarioEntity): void {
    if (!usuario.estado) throw CustomError.forbidden("Usuario inactivo");
    if (!usuario.emailValidated) {
      throw CustomError.forbidden("La cuenta no está validada en NUBEADMIN");
    }
  }

  private async issueSession(
    usuario: UsuarioEntity,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const token = await JwtPlugin.generateToken({ id: usuario.id });
    if (!token) throw CustomError.internalServer("No se pudo generar el token");

    const { password: _password, ...safeUsuario } = usuario;
    return { token, usuario: safeUsuario };
  }
}
