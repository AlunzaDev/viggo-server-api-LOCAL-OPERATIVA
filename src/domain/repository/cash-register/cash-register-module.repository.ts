import type { CashRegisterModuloProjection } from "../../datasources/cash-register/cash-register-module.datasource";

export abstract class CashRegisterModuleRepository {
  abstract findById(moduloId: string): Promise<CashRegisterModuloProjection | null>;
}
