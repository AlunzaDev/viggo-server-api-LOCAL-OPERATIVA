import { buildCashRegisterCountRepository, buildCashRegisterCutRepository, buildCashRegisterModuleRepository, buildCashRegisterMovementRepository, buildCashRegisterShiftRepository } from "./repositories.dependencies";
import { CashRegisterController } from "../routes/cash-register/cash-register.controller";
import { CashRegisterService } from "../services/cash-register/cash-register.service";

export const buildCashRegisterController = (): CashRegisterController => {
  const shiftRepository = buildCashRegisterShiftRepository();
  const movementRepository = buildCashRegisterMovementRepository();
  const countRepository = buildCashRegisterCountRepository();
  const cutRepository = buildCashRegisterCutRepository();
  const moduleRepository = buildCashRegisterModuleRepository();

  const service = new CashRegisterService(
    shiftRepository,
    movementRepository,
    countRepository,
    cutRepository,
    moduleRepository,
  );

  return new CashRegisterController(service);
};
