import { buildModuloRepository, buildPensionMoveRepository, buildPensionPassRepository, buildPensionRepository, buildProyectoRepository, buildTransactionRunner } from "./repositories.dependencies";
import { PensionMoveController } from "../routes/pension/pension-move.controller";
import { PensionPassController } from "../routes/pension/pension-pass.controller";
import { PensionController } from "../routes/pension/pension.controller";
import { PensionMoveService } from "../services/pension/pension-move.service";
import { PensionPassService } from "../services/pension/pension-pass.service";
import { PensionService } from "../services/pension/pension.service";

export const buildPensionController = (): PensionController => {
  const service = new PensionService(
    buildPensionRepository(),
    buildProyectoRepository(),
  );

  return new PensionController(service);
};

export const buildPensionPassController = (): PensionPassController => {
  const service = new PensionPassService(
    buildPensionPassRepository(),
    buildPensionRepository(),
    buildProyectoRepository(),
    buildModuloRepository(),
    buildPensionMoveRepository(),
    buildTransactionRunner(),
  );

  return new PensionPassController(service);
};

export const buildPensionMoveController = (): PensionMoveController => {
  const service = new PensionMoveService(
    buildPensionMoveRepository(),
    buildPensionPassRepository(),
    buildProyectoRepository(),
    buildModuloRepository(),
  );

  return new PensionMoveController(service);
};
