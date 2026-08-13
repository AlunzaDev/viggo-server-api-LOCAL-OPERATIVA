import { RemoteSupportService } from "../../application/services/remote-support/remote-support.service";
import { CreateRemoteSupportSessionUrlUseCase } from "../../application/use-cases/remote-support/create-remote-support-session-url.usecase";
import { ResolveRemoteSupportDeviceUseCase } from "../../application/use-cases/remote-support/resolve-remote-support-device.usecase";
import { ModuloMongoDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.mongo";
import { ProyectoMongoDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.mongo";
import { TicketMongoDatasource } from "../../infrastructure/datasources/parking/ticket.datasource.mongo";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { TicketRepositoryImpl } from "../../infrastructure/repositories/parking/ticket.repository.impl";
import { ModuloController } from "../routes/parking/modulo.controller";
import { ProyectoController } from "../routes/parking/proyecto.controller";
import { TicketController } from "../routes/parking/ticket.controller";
import { ModuloService } from "../services/parking/modulo.service";
import { ProyectoService } from "../services/parking/proyecto.service";
import { TicketService } from "../services/parking/ticket.service";

const buildModuloRepository = () =>
  new ModuloRepositoryImpl(new ModuloMongoDatasource());

const buildProyectoRepository = () =>
  new ProyectoRepositoryImpl(new ProyectoMongoDatasource());

const buildTicketRepository = () =>
  new TicketRepositoryImpl(new TicketMongoDatasource());

export const buildModuloService = (): ModuloService =>
  new ModuloService(buildModuloRepository(), buildProyectoRepository());

export const buildModuloController = (): ModuloController => {
  const moduloRepository = buildModuloRepository();
  const proyectoRepository = buildProyectoRepository();
  const service = new ModuloService(moduloRepository, proyectoRepository);
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

export const buildTicketService = (): TicketService => {
  return new TicketService(
    buildTicketRepository(),
    buildProyectoRepository(),
    buildModuloRepository(),
  );
};