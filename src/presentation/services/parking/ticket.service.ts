import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";
import { TicketRepository } from "../../../domain/repositories/parking/ticket.repository";
import {
  buildPaginatedResponse,
  paginateArray,
  parsePaginationDateQuery,
  PaginationDateQuery,
} from "../shared/pagination-query";
import { SocketServerPlugin } from "../../sockets/socket-server";
import { buildOperationalLogsService } from "../../dependencies/operational-logs.dependencies";

const operationalLogsService = buildOperationalLogsService();

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

interface LegacyTicketResponse {
  uid: string;
  proyecto: {
    _id: string;
    nombre: string;
    ciudad: string;
  };
  entrada: {
    _id: string;
    nombre: string;
  };
  usuario: string;
  idBoleto: string;
  horaInicio: number;
  salida?: string;
  horaConsulta: number;
  horaCobro: number;
  horaSalida: number;
  duracion: number;
  monto: number;
  pagado: boolean;
}

export class TicketService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly proyectoRepository: ProyectoRepository,
    private readonly moduloRepository: ModuloRepository,
  ) {}

  async createTicket(ticket: Omit<TicketEntity, "id">): Promise<TicketEntity> {
    const proyecto = await this.proyectoRepository.findById(ticket.proyecto);

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    const moduloEntrada = await this.moduloRepository.findById(ticket.entrada);

    if (!moduloEntrada) {
      throw CustomError.badRequest("El modulo de entrada no existe");
    }

    const ticketExists = await this.ticketRepository.findByIdBoleto(
      ticket.idBoleto,
    );

    if (ticketExists) {
      throw CustomError.badRequest(
        `El ticket con idBoleto '${ticket.idBoleto}' ya existe`,
      );
    }

    const activeTicket = await this.ticketRepository.getActiveByUsuario(
      ticket.usuario,
    );

    if (activeTicket) {
      throw CustomError.badRequest("El usuario ya tiene un ticket activo");
    }

    return this.ticketRepository.create(ticket);
  }

  async createTicketFromModuleToken(
    usuarioId: string,
    moduleToken: string,
    options: { idempotencyKey?: string } = {},
  ): Promise<TicketEntity> {
    const idempotencyKey = this.normalizeIdempotencyKey(
      options.idempotencyKey,
    );
    if (idempotencyKey) {
      const existingTicket = await this.ticketRepository.findByExitIdempotencyKey(
        idempotencyKey,
      );
      if (existingTicket) return existingTicket;
    }

    const moduloId = await this.getModuloIdFromToken(moduleToken);
    const modulo = await this.moduloRepository.findById(moduloId);

    if (!modulo) {
      throw CustomError.badRequest("El modulo de entrada no existe");
    }

    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);

    if (!proyecto) {
      throw CustomError.badRequest("El proyecto asociado no existe");
    }

    let ticket: TicketEntity;
    try {
      ticket = await this.createTicket({
        proyecto: proyecto.id,
        entrada: modulo.id,
        usuario: usuarioId,
        idBoleto: this.createIdBoleto(
          proyecto.identificador,
          modulo.identificador,
        ),
        horaInicio: Date.now(),
        horaConsulta: -1,
        horaCobro: -1,
        horaSalida: -1,
        duracion: 0,
        monto: 0,
        pagado: false,
        status: "ACTIVE",
        barrierOpenedAt: -1,
        barrierConfirmedAt: -1,
        fraudDetectedAt: -1,
        fraudReason: "",
        idempotencyKey,
      });
    } catch (error) {
      const duplicateKeyError =
        idempotencyKey &&
        typeof error === "object" &&
        error !== null &&
        (error as { code?: number }).code === 11000;
      if (duplicateKeyError) {
        const existingTicket = await this.ticketRepository.findByIdempotencyKey(
          idempotencyKey,
        );
        if (existingTicket) return existingTicket;
      }
      throw error;
    }
    await operationalLogsService.logEvent({
      scope: "access_flow",
      type: "ticket_created",
      severity: "info",
      projectId: proyecto.id,
      projectName: proyecto.nombre,
      moduloId: modulo.id,
      moduloNombre: modulo.nombre,
      ticketId: ticket.id,
      flowId: ticket.id,
      source: "app",
      message: "Se creo un nuevo ticket de entrada desde el modulo local.",
      metadata: {
        idBoleto: ticket.idBoleto,
        usuarioId,
        moduleTokenUsed: true,
        idempotencyKey,
      },
    });

    try {
      await SocketServerPlugin.openBarrier(modulo.id, {
        msg: "open",
        accessTracking: {
          kind: "ticket",
          ticketId: ticket.id,
          moduleId: modulo.id,
          mode: "entrada",
        },
      });
    } catch (error) {
      await operationalLogsService.logIncident({
        scope: "access_flow",
        type: "entry_open_barrier_failed",
        severity: "critical",
        projectId: proyecto.id,
        projectName: proyecto.nombre,
        moduloId: modulo.id,
        moduloNombre: modulo.nombre,
        ticketId: ticket.id,
        flowId: ticket.id,
        source: "backend",
        message: error instanceof Error ? error.message : "No se pudo abrir la barrera de entrada.",
        metadata: {
          idBoleto: ticket.idBoleto,
          usuarioId,
        },
      });
      await this.deleteTicket(ticket.id);
      throw error;
    }

    return ticket;
  }

  async killTicketFromModuleToken(
    usuarioId: string,
    moduleToken: string,
    options: { idempotencyKey?: string } = {},
  ): Promise<TicketEntity> {
    const idempotencyKey = this.normalizeIdempotencyKey(
      options.idempotencyKey,
    );
    if (idempotencyKey) {
      const existingTicket = await this.ticketRepository.findByIdempotencyKey(
        idempotencyKey,
      );
      if (existingTicket) return existingTicket;
    }

    const ticket = await this.ticketRepository.getActiveByUsuario(usuarioId);

    if (!ticket || !ticket.pagado) {
      throw CustomError.badRequest("No cuenta con un ticket pagado para salir");
    }

    const moduloId = await this.getModuloIdFromToken(moduleToken);
    const modulo = await this.moduloRepository.findById(moduloId);

    if (!modulo) {
      throw CustomError.badRequest("El modulo de salida no existe");
    }

    await operationalLogsService.logEvent({
      scope: "access_flow",
      type: "ticket_exit_requested",
      severity: "info",
      projectId: ticket.proyecto,
      moduloId: modulo.id,
      moduloNombre: modulo.nombre,
      ticketId: ticket.id,
      flowId: ticket.id,
      source: "app",
      message: "Se solicito la salida de un ticket pagado desde el modulo local.",
      metadata: {
        idBoleto: ticket.idBoleto,
        usuarioId,
        idempotencyKey,
      },
    });

    await SocketServerPlugin.openBarrier(modulo.id, {
      msg: "open",
      accessTracking: {
        kind: "ticket",
        ticketId: ticket.id,
        moduleId: modulo.id,
        mode: "salida",
      },
    });

    return this.updateTicket(ticket.id, {
      salida: modulo.id,
      horaSalida: Date.now(),
      status: "COMPLETED",
      exitIdempotencyKey: idempotencyKey,
    });
  }

  async getTickets(): Promise<TicketEntity[]> {
    return this.ticketRepository.getAll();
  }

  async getTicketById(id: string): Promise<TicketEntity> {
    const ticket = await this.ticketRepository.findById(id);

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    return ticket;
  }

  async getTicketsByUsuario(usuarioId: string): Promise<TicketEntity[]> {
    return this.ticketRepository.getByUsuario(usuarioId);
  }

  async getHistoryTicketsByUsuario(
    usuarioId: string,
    query: PaginationDateQuery,
  ) {
    const { page, limit, from, to } = parsePaginationDateQuery(query);
    const tickets = await this.ticketRepository.getByUsuario(usuarioId);
    const filteredTickets = tickets
      .filter((ticket) => this.isInDateRange(ticket.horaInicio, from, to))
      .sort((a, b) => b.horaInicio - a.horaInicio);
    const paginatedTickets = paginateArray(filteredTickets, page, limit);
    const legacyTickets = await this.toLegacyTicketsResponse(paginatedTickets);

    return buildPaginatedResponse(
      "tickets",
      legacyTickets,
      filteredTickets.length,
      page,
      limit,
    );
  }

  async getActiveTicketByUsuario(
    usuarioId: string,
  ): Promise<TicketEntity | null> {
    const ticket = await this.ticketRepository.getActiveByUsuario(usuarioId);

    if (!ticket || ticket.pagado) {
      return ticket;
    }

    const horaConsulta = Date.now();
    const duracion = this.calculateDurationInMinutes(
      ticket.horaInicio,
      horaConsulta,
    );
    const monto = this.calculateTicketAmount(duracion);

    return this.updateTicket(ticket.id, {
      horaConsulta,
      duracion,
      monto,
    });
  }

  async updateTicket(
    id: string,
    ticket: Partial<Omit<TicketEntity, "id">>,
  ): Promise<TicketEntity> {
    const ticketUpdated = await this.ticketRepository.update(id, ticket);

    if (!ticketUpdated) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    return ticketUpdated;
  }

  async deleteTicket(id: string): Promise<TicketEntity> {
    const ticketDeleted = await this.ticketRepository.delete(id);

    if (!ticketDeleted) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    return ticketDeleted;
  }

  async toLegacyTicketResponse(
    ticket: TicketEntity,
  ): Promise<LegacyTicketResponse> {
    const [proyecto, entrada] = await Promise.all([
      this.proyectoRepository.findById(ticket.proyecto),
      this.moduloRepository.findById(ticket.entrada),
    ]);

    return {
      uid: ticket.id,
      proyecto: {
        _id: ticket.proyecto,
        nombre: proyecto?.nombre ?? "",
        ciudad: proyecto?.ciudad ?? "---",
      },
      entrada: {
        _id: ticket.entrada,
        nombre: entrada?.nombre ?? "",
      },
      usuario: ticket.usuario,
      idBoleto: ticket.idBoleto,
      horaInicio: ticket.horaInicio,
      salida: ticket.salida,
      horaConsulta: ticket.horaConsulta,
      horaCobro: ticket.horaCobro,
      horaSalida: ticket.horaSalida,
      duracion: ticket.duracion,
      monto: ticket.monto,
      pagado: ticket.pagado,
    };
  }

  async toLegacyTicketsResponse(
    tickets: TicketEntity[],
  ): Promise<LegacyTicketResponse[]> {
    return Promise.all(
      tickets.map((ticket) => this.toLegacyTicketResponse(ticket)),
    );
  }

  private async getModuloIdFromToken(moduleToken: string): Promise<string> {
    const payload = await JwtPlugin.validateToken(moduleToken);

    if (!payload || typeof payload !== "object") {
      throw CustomError.badRequest("El token de entrada es invalido");
    }

    const moduloId =
      "id" in payload
        ? String(payload.id)
        : "uid" in payload
          ? String(payload.uid)
          : "";

    if (!moduloId) {
      throw CustomError.badRequest("El token de entrada es invalido");
    }

    return moduloId;
  }

  private normalizeIdempotencyKey(value?: string): string | undefined {
    const idempotencyKey = typeof value === "string" ? value.trim() : "";
    if (!idempotencyKey) return undefined;
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw CustomError.badRequest(
        "'idempotencyKey' debe tener entre 16 y 128 caracteres validos",
        { idempotencyKey },
        "INVALID_IDEMPOTENCY_KEY",
      );
    }
    return idempotencyKey;
  }

  private createIdBoleto(
    proyectoIdentificador: string,
    moduloIdentificador: string,
  ): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const datePart = [
      pad(now.getDate()),
      pad(now.getMonth() + 1),
      String(now.getFullYear()).slice(-2),
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");

    return `00${datePart}${proyectoIdentificador}${moduloIdentificador}`;
  }

  private calculateDurationInMinutes(
    horaInicio: number,
    horaFinal: number,
  ): number {
    const difference = horaFinal - horaInicio;
    return Math.round(difference / 1000 / 60);
  }

  private calculateTicketAmount(minutes: number): number {
    return minutes < 60 ? 10 : 20;
  }

  private isInDateRange(value: number, from?: number, to?: number): boolean {
    if (from !== undefined && value < from) return false;
    if (to !== undefined && value > to) return false;

    return true;
  }
}
