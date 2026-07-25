import { CashRegisterController } from "../routes/cash-register/cash-register.controller";
import { CashRegisterService } from "../services/cash-register/cash-register.service";
import { CashRegisterCountMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-count.datasource.mongo";
import { CashRegisterCutMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-cut.datasource.mongo";
import { CashRegisterMovementMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-movement.datasource.mongo";
import { CashRegisterShiftMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-shift.datasource.mongo";
import { CashRegisterCountRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-count.repository.impl";
import { CashRegisterCutRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-cut.repository.impl";
import { CashRegisterMovementRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-movement.repository.impl";
import { CashRegisterShiftRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-shift.repository.impl";
import { CashRegisterModuleMongoDatasource } from "../../infrastructure/datasources/cash-register/cash-register-module.datasource.mongo";
import { CashRegisterModuleRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-module.repository.impl";

export const buildCashRegisterController = (): CashRegisterController => {
  const shiftRepository = new CashRegisterShiftRepositoryImpl(
    new CashRegisterShiftMongoDatasource(),
  );
  const movementRepository = new CashRegisterMovementRepositoryImpl(
    new CashRegisterMovementMongoDatasource(),
  );
  const countRepository = new CashRegisterCountRepositoryImpl(
    new CashRegisterCountMongoDatasource(),
  );
  const cutRepository = new CashRegisterCutRepositoryImpl(
    new CashRegisterCutMongoDatasource(),
  );
  const moduleRepository = new CashRegisterModuleRepositoryImpl(
    new CashRegisterModuleMongoDatasource(),
  );

  const service = new CashRegisterService(
    shiftRepository,
    movementRepository,
    countRepository,
    cutRepository,
    moduleRepository,
  );

  return new CashRegisterController(service);
};
