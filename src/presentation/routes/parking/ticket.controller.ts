import type { Request, Response } from "express";
import { CreateTicketDto } from "../../../domain/dtos/parking/create-ticket.dto";
import { TicketListQueryDto } from "../../../domain/dtos/parking/ticket-list-query.dto";
import { UpdateTicketDto } from "../../../domain/dtos/parking/update-ticket.dto";
import type { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { projectAccessFromRequest } from "../../middlewares";
import { ErrorService } from "../../services/error.service";
import type { TicketService } from "../../services/parking/ticket.service";
import { buildPaginatedResponse, paginateArray, parsePaginationDateQuery } from "../../services/shared/pagination-query";

const userIdOf = (req: Request) => (req as Request & { uid?: string }).uid;

/** The Idempotency-Key header, or `idempotencyKey` in the body for older clients. */
const idempotencyKeyOf = (req: Request): string | undefined => {
  const header = String(req.header("Idempotency-Key") ?? "").trim();
  if (header) return header;
  const body = req.body as { idempotencyKey?: unknown };
  return typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined;
};

/** The ticket list filters of the query, or the problem. */
const listQuery = (req: Request) => {
  const { from, to } = parsePaginationDateQuery(req.query);
  return TicketListQueryDto.create(req.query as Record<string, unknown>, { from, to });
};

/** Without `page`/`limit` the whole list; with them, a page. */
const listResponse = (req: Request, res: Response, tickets: TicketEntity[]) => {
  if (req.query.page === undefined && req.query.limit === undefined) return res.status(200).json({ tickets });
  const { page, limit } = parsePaginationDateQuery(req.query);
  return res.status(200).json(buildPaginatedResponse("tickets", paginateArray(tickets, page, limit), tickets.length, page, limit));
};

/** HTTP for tickets; the rules and the user's scope live in TicketService. */
export class TicketController {
  constructor(private readonly tickets: TicketService) {}

  createTicket = async (req: Request, res: Response) => {
    try {
      const [error, dto] = CreateTicketDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      return res.status(201).json({ ticket: await this.tickets.createAccessibleTicket(dto, projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** Entry from the app with a module QR, in the shape the old app reads. */
  createTicketLegacy = async (req: Request, res: Response) => {
    try {
      const usuarioId = userIdOf(req);
      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });
      const { moduleToken } = req.body as { moduleToken?: unknown };
      if (typeof moduleToken !== "string" || !moduleToken.trim()) return res.status(400).json({ error: "'moduleToken' es requerido" });
      const ticket = await this.tickets.createTicketFromModuleToken(usuarioId, moduleToken.trim(), { idempotencyKey: idempotencyKeyOf(req) });
      return res.status(200).json({ ticket: await this.tickets.toLegacyTicketResponse(ticket) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  /** Exit from the app with a module QR, in the shape the old app reads. */
  killTicketLegacy = async (req: Request, res: Response) => {
    try {
      const usuarioId = userIdOf(req);
      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });
      const { moduleToken } = req.body as { moduleToken?: unknown };
      if (typeof moduleToken !== "string" || !moduleToken.trim()) return res.status(400).json({ error: "'moduleToken' es requerido" });
      const ticket = await this.tickets.killTicketFromModuleToken(usuarioId, moduleToken.trim(), { idempotencyKey: idempotencyKeyOf(req) });
      return res.status(200).json({ ticket: await this.tickets.toLegacyTicketResponse(ticket) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTickets = async (req: Request, res: Response) => {
    try {
      const [error, query] = listQuery(req);
      if (error || !query) return res.status(400).json({ error });
      return listResponse(req, res, await this.tickets.listTickets(query, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketsByUsuario = async (req: Request, res: Response) => {
    try {
      const [error, query] = listQuery(req);
      if (error || !query) return res.status(400).json({ error });
      return listResponse(req, res, await this.tickets.listTicketsByUsuario(String(req.params.usuarioId), query, projectAccessFromRequest(req)));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getTicketById = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ ticket: await this.tickets.getAccessibleTicket(String(req.params.id), projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyHistoryTickets = async (req: Request, res: Response) => {
    try {
      const usuarioId = userIdOf(req);
      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });
      return res.status(200).json(await this.tickets.getHistoryTicketsByUsuario(usuarioId, req.query));
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getMyCurrentTicket = async (req: Request, res: Response) => {
    try {
      const usuarioId = userIdOf(req);
      if (!usuarioId) return res.status(401).json({ error: "Unauthorized" });
      const ticket = await this.tickets.getActiveTicketByUsuario(usuarioId);
      if (!ticket) return res.status(204).send();
      return res.status(200).json({ ticket: await this.tickets.toLegacyTicketResponse(ticket) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  getActiveTicketByUsuario = async (req: Request, res: Response) => {
    try {
      return res.status(200).json({ ticket: await this.tickets.getAccessibleActiveTicket(String(req.params.usuarioId), projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  updateTicket = async (req: Request, res: Response) => {
    try {
      const [error, dto] = UpdateTicketDto.create(req.body);
      if (error || !dto) return res.status(400).json({ error });
      return res.status(200).json({ ticket: await this.tickets.updateAccessibleTicket(String(req.params.id), dto, projectAccessFromRequest(req)) });
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
