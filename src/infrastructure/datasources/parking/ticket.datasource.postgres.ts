import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import { TicketDatasource } from "../../../domain/datasources/parking/ticket.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { TicketEntity } from "../../../domain/entities/parking/ticket.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { ticketColumns, toTicketEntity, type TicketValues } from "./ticket.prisma-mapper";

const invalidReference = CustomError.badRequest("El proyecto o modulo del ticket no existe");
const order = [{ horaInicio: "asc" as const }, { id: "asc" as const }];

export class TicketPostgresDatasource extends TicketDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  private async findFirst(where: Prisma.TicketWhereInput): Promise<TicketEntity | null> {
    const row = await this.db.ticket.findFirst({ where, orderBy: order });
    return row ? toTicketEntity(row) : null;
  }

  /** A repeated idempotency key, idBoleto or second open ticket raises UniqueConstraintError. */
  async create(ticket: Omit<TicketEntity, "id">): Promise<TicketEntity> {
    const row = await withPrismaErrors(
      () => this.db.ticket.create({ data: ticketColumns(ticket) as Prisma.TicketUncheckedCreateInput }),
      { foreignKey: invalidReference },
    );
    return toTicketEntity(row);
  }

  async findById(id: string): Promise<TicketEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.ticket.findUnique({ where: { id } });
    return row ? toTicketEntity(row) : null;
  }

  findByIdBoleto(idBoleto: string): Promise<TicketEntity | null> {
    return this.findFirst({ idBoleto });
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<TicketEntity | null> {
    return this.findFirst({ idempotencyKey });
  }

  findByExitIdempotencyKey(idempotencyKey: string): Promise<TicketEntity | null> {
    return this.findFirst({ exitIdempotencyKey: idempotencyKey });
  }

  async getAll(): Promise<TicketEntity[]> {
    const rows = await this.db.ticket.findMany({ orderBy: order });
    return rows.map(toTicketEntity);
  }

  async getByUsuario(usuarioId: string): Promise<TicketEntity[]> {
    if (!isUuid(usuarioId)) return [];
    const rows = await this.db.ticket.findMany({ where: { usuarioId }, orderBy: order });
    return rows.map(toTicketEntity);
  }

  /** "Active" = not exited yet (was horaSalida -1). */
  getActiveByUsuario(usuarioId: string): Promise<TicketEntity | null> {
    if (!isUuid(usuarioId)) return Promise.resolve(null);
    return this.findFirst({ usuarioId, horaSalida: null });
  }

  async update(id: string, ticket: TicketValues): Promise<TicketEntity | null> {
    if (!isUuid(id)) return null;
    const result = await withPrismaErrors(
      () => this.db.ticket.updateMany({ where: { id }, data: ticketColumns(ticket) }),
      { foreignKey: invalidReference },
    );
    return result.count ? this.findById(id) : null;
  }

  async delete(id: string): Promise<TicketEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await withPrismaErrors(() => this.db.ticket.delete({ where: { id } }), {
      foreignKey: CustomError.conflict("El ticket tiene sesiones de cobro registradas"),
    });
    return existing;
  }
}
