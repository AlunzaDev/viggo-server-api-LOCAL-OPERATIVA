import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { AuthDatasource } from "../../../domain/datasources/auth/auth.datasource";
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
}
