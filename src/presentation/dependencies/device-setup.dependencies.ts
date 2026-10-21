import { DeviceSetupController } from "../routes/device-setup/device-setup.controller";
import { DeviceSetupService } from "../services/device-setup/device-setup.service";
import { buildModuloRepository, buildProyectoRepository } from "./repositories.dependencies";

export const buildDeviceSetupController = () =>
  new DeviceSetupController(new DeviceSetupService(buildProyectoRepository(), buildModuloRepository()));
