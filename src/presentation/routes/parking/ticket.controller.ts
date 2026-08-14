import { Request, Response } from "express";
import { CreateTicketDto } from "../../../domain/dtos/parking/create-ticket.dto";
import { UpdateTicketDto } from "../../../domain/dtos/parking/update-ticket.dto";
import { ErrorService } from "../../services/error.service";
import {
  canAccessProjectFromRequest,
  getAllowedProjectIdsFromRequest,
  isSuperAdminRequest,
} from "../../middlewares";
import { TicketService } from "../../services/parking/ticket.service";
import {
  buildPaginatedResponse,
  paginateArray,
  parsePaginationDateQuery,
} from "../../services/shared/pagination-query";

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const parseBooleanQuery = (value: unknown): boolean | undefined | null => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return null;
};

const getIdempotencyKeyFromRequest = (req: Request): string | undefined => {
  const headerValue = String(req.header("Idempotency-Key") ?? "").trim();
  if (headerValue) return headerValue;

  const body = req.body as { idempotencyKey?: unknown };
  return typeof body.idempotencyKey === "string"
    ? body.idempotencyKey.trim()
    : undefined;
};

export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  private filterTickets(
    tickets: Awaited<ReturnType<TicketService["getTickets"]>>,
    query: Request["query"],
  ) {
    const proyecto =
      typeof query.proyecto === "string" ? query.proyecto.trim() : "";
    const status = typeof query.status === "string" ? query.status.trim().toUpperCase() : "";
    const search = typeof query.search === "string" ? query.search.trim() : "";
    const pagado = parseBooleanQuery(query.pagado);
    if (pagado === null) {
      throw new Error("__INVALID_PAGADO__");
    }

    const { from, to } = parsePaginationDateQuery(query);
    let filtered = tickets;

    if (proyecto) {
      filtered = filtered.filter((ticket) => ticket.proyecto === proyecto);
    }

    if (status) {
      filtered = filtered.filter((ticket) => String(ticket.status ?? "").toUpperCase() === status);
    }

    if (pagado !== undefined) {
      filtered = filtered.filter((ticket) => ticket.pagado === pagado);
    }

    if (from !== undefined || to !== undefined) {
      filtered = filtered.filter((ticket) => {
        if (from !== undefined && ticket.horaInicio < from) return false;
        if (to !== undefined && ticket.horaInicio > to) return false;
        return true;
      });
    }

    if (search) {
      const normalizedSearch = normalizeText(search);
      filtered = filtered.filter((ticket) =>
        [ticket.idBoleto, ticket.usuario, ticket.entrada, ticket.salida ?? ""].some((value) =>
          normalizeText(String(value ?? "")).includes(normalizedSearch),
        ),
      );
    }

    return filtered.sort((a, b) => b.horaInicio - a.horaInicio);
  }

  createTicket = async (req: Request, res: Response) => {
    try {
      const [error, createTicketDto] = CreateTicketDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (!canAccessProjectFromRequest(req, createTicketDto!.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const ticket = await this.ticketService.createTicket(createTicketDto!);
      return res.status(201).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  createTicketLegacy = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const { moduleToken } = req.body as { moduleToken?: unknown };

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (typeof moduleToken !== "string" || moduleToken.trim().length === 0) {
        return res.status(400).json({ error: "'moduleToken' es requerido" });
      }

      const ticket = await this.ticketService.createTicketFromModuleToken(
        usuarioId,
        moduleToken.trim(),
        { idempotencyKey: getIdempotencyKeyFromRequest(req) },
      );
      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);

      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  killTicketLegacy = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;
      const { moduleToken } = req.body as { moduleToken?: unknown };

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (typeof moduleToken !== "string" || moduleToken.trim().length === 0) {
        return res.status(400).json({ error: "'moduleToken' es requerido" });
      }

      const ticket = await this.ticketService.killTicketFromModuleToken(
        usuarioId,
        moduleToken.trim(),
        { idempotencyKey: getIdempotencyKeyFromRequest(req) },
      );
      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);

      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTickets = async (req: Request, res: Response) => {
    try {
      const allowedProjectIds = getAllowedProjectIdsFromRequest(req);
      const tickets = await this.ticketService.getTickets();
      const shouldPaginate =
        req.query.page !== undefined || req.query.limit !== undefined;
      const { page, limit } = parsePaginationDateQuery(req.query);
      let filteredTickets = isSuperAdminRequest(req)
        ? tickets
        : tickets.filter((ticket) => allowedProjectIds.includes(ticket.proyecto));
      filteredTickets = this.filterTickets(filteredTickets, req.query);

      if (!shouldPaginate) {
        return res.status(200).json({ tickets: filteredTickets });
      }

      return res.status(200).json(
        buildPaginatedResponse(
          "tickets",
          paginateArray(filteredTickets, page, limit),
          filteredTickets.length,
          page,
          limit,
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "__INVALID_PAGADO__") {
        return res.status(400).json({ error: "'pagado' debe ser boolean" });
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketById = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const ticket = await this.ticketService.getTicketById(id);
      if (!canAccessProjectFromRequest(req, ticket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketsByUsuario = async (req: Request, res: Response) => {
    try {
      const usuarioId = String(req.params.usuarioId);
      const tickets = await this.ticketService.getTicketsByUsuario(usuarioId);
      const shouldPaginate =
        req.query.page !== undefined || req.query.limit !== undefined;
      const { page, limit } = parsePaginationDateQuery(req.query);
      let filteredTickets = isSuperAdminRequest(req)
        ? tickets
        : tickets.filter((ticket) =>
            getAllowedProjectIdsFromRequest(req).includes(ticket.proyecto),
          );
      filteredTickets = this.filterTickets(filteredTickets, req.query);

      if (!shouldPaginate) {
        return res.status(200).json({ tickets: filteredTickets });
      }

      return res.status(200).json(
        buildPaginatedResponse(
          "tickets",
          paginateArray(filteredTickets, page, limit),
          filteredTickets.length,
          page,
          limit,
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "__INVALID_PAGADO__") {
        return res.status(400).json({ error: "'pagado' debe ser boolean" });
      }
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyHistoryTickets = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const response = await this.ticketService.getHistoryTicketsByUsuario(
        usuarioId,
        req.query,
      );

      return res.status(200).json(response);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyCurrentTicket = async (req: Request, res: Response) => {
    try {
      const authRequest = req as Request & { uid?: string };
      const usuarioId = authRequest.uid;

      if (!usuarioId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const ticket =
        await this.ticketService.getActiveTicketByUsuario(usuarioId);

      if (!ticket) {
        return res.status(204).send();
      }

      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);
      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  payTicketLegacy = async (req: Request, res: Response) => {
    try {
      const { idTicket } = req.body as { idTicket?: unknown };

      if (typeof idTicket !== "string" || idTicket.trim().length === 0) {
        return res.status(400).json({ error: "'idTicket' es requerido" });
      }

      const currentTicket = await this.ticketService.getTicketById(idTicket.trim());
      if (!canAccessProjectFromRequest(req, currentTicket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const ticket = await this.ticketService.updateTicket(idTicket.trim(), {
        pagado: true,
        horaCobro: Date.now(),
      });
      const legacyTicket =
        await this.ticketService.toLegacyTicketResponse(ticket);

      return res.status(200).json({ ticket: legacyTicket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getActiveTicketByUsuario = async (req: Request, res: Response) => {
    try {
      const usuarioId = String(req.params.usuarioId);
      const ticket =
        await this.ticketService.getActiveTicketByUsuario(usuarioId);
      if (ticket && !canAccessProjectFromRequest(req, ticket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateTicket = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentTicket = await this.ticketService.getTicketById(id);
      if (!canAccessProjectFromRequest(req, currentTicket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const [error, updateTicketDto] = UpdateTicketDto.create(req.body);
      if (error) return res.status(400).json({ error });
      if (
        updateTicketDto?.proyecto &&
        !canAccessProjectFromRequest(req, updateTicketDto.proyecto)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const ticket = await this.ticketService.updateTicket(
        id,
        updateTicketDto!,
      );
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  deleteTicket = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const currentTicket = await this.ticketService.getTicketById(id);
      if (!canAccessProjectFromRequest(req, currentTicket.proyecto)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const ticket = await this.ticketService.deleteTicket(id);
      return res.status(200).json({ ticket });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
