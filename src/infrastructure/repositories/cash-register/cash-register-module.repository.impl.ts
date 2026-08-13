import type {
  CashRegisterModuloProjection,
  CashRegisterModuleDatasource,
} from "../../../domain/datasources/cash-register/cash-register-module.datasource";
import { CashRegisterModuleRepository } from "../../../domain/repositories/cash-register/cash-register-module.repository";

export class CashRegisterModuleRepositoryImpl implements CashRegisterModuleRepository {
  constructor(private readonly datasource: CashRegisterModuleDatasource) {}

  findById(moduloId: string): Promise<CashRegisterModuloProjection | null> {
    return this.datasource.findById(moduloId);
  }
}
