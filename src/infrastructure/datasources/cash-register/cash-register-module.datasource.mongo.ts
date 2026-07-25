import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import {
  CashRegisterModuleDatasource,
  type CashRegisterModuloProjection,
} from "../../../domain/datasources/cash-register/cash-register-module.datasource";

export class CashRegisterModuleMongoDatasource implements CashRegisterModuleDatasource {
  async findById(moduloId: string): Promise<CashRegisterModuloProjection | null> {
    const modulo = await ModuloModel.findById(moduloId).lean();
    if (!modulo) return null;

    return {
      id: String(modulo._id),
      proyectoId: String(modulo.proyecto ?? ""),
      tipo: String(modulo.tipo ?? ""),
      estado: modulo.estado !== false,
      identificador: String(modulo.identificador ?? "").trim() || undefined,
      nombre: String(modulo.nombre ?? "").trim() || undefined,
    };
  }
}
