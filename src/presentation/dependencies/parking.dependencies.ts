import { buildModuloRepository, buildParkingRateRepository, buildProyectoRepository, buildTicketRepository } from "./repositories.dependencies";
import { RemoteSupportService } from "../../application/services/remote-support/remote-support.service";
import { CreateRemoteSupportSessionUrlUseCase } from "../../application/use-cases/remote-support/create-remote-support-session-url.usecase";
import { ResolveRemoteSupportDeviceUseCase } from "../../application/use-cases/remote-support/resolve-remote-support-device.usecase";
import { ModuloController } from "../routes/parking/modulo.controller";
import { ProyectoController } from "../routes/parking/proyecto.controller";
import { TicketController } from "../routes/parking/ticket.controller";
import { ModuloService } from "../services/parking/modulo.service";
import { ProyectoService } from "../services/parking/proyecto.service";
import { TicketService } from "../services/parking/ticket.service";
import { ParkingFeeService } from "../services/parking/parking-fee.service";
import { ParkingRateService } from "../services/parking/parking-rate.service";
import { buildLocalInstallationService } from "./installation.dependencies";

export const buildModuloService = (): ModuloService =>
  new ModuloService(
    buildModuloRepository(),
    buildProyectoRepository(),
    buildLocalInstallationService(),
  );

export const buildModuloController = (): ModuloController => {
  const moduloRepository = buildModuloRepository();
  const proyectoRepository = buildProyectoRepository();
  const service = new ModuloService(
    moduloRepository,
    proyectoRepository,
    buildLocalInstallationService(),
  );
  const remoteSupportService = new RemoteSupportService(
    moduloRepository,
    proyectoRepository,
  );
  const resolveRemoteSupportDeviceUseCase = new ResolveRemoteSupportDeviceUseCase(
    remoteSupportService,
  );
  const createRemoteSupportSessionUrlUseCase = new CreateRemoteSupportSessionUrlUseCase(
    remoteSupportService,
  );

  return new ModuloController(
    service,
    resolveRemoteSupportDeviceUseCase,
    createRemoteSupportSessionUrlUseCase,
  );
};

export const buildProyectoController = (): ProyectoController => {
  const service = new ProyectoService(buildProyectoRepository());

  return new ProyectoController(service);
};

export const buildTicketController = (): TicketController => {
  return new TicketController(buildTicketService());
};

export const buildParkingRateService = (): ParkingRateService =>
  new ParkingRateService(buildParkingRateRepository());

export const buildParkingFeeService = (): ParkingFeeService =>
  new ParkingFeeService(buildParkingRateRepository());

export const buildTicketService = (): TicketService => {
  return new TicketService(
    buildTicketRepository(),
    buildProyectoRepository(),
    buildModuloRepository(),
    buildParkingFeeService(),
  );
};