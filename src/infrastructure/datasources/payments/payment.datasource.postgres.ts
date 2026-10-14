import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma, PaymentStatus, PaymentType } from "../../../generated/prisma/client";
import { PaymentDatasource } from "../../../domain/datasources/payments/payment.datasource";
import {
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PaymentEntity,
} from "../../../domain/entities/payments/payment.entity";
import { isUuid } from "../postgres/prisma-errors";
import { paymentColumns, toPaymentEntity, type PaymentValues } from "./payments.prisma-mapper";

interface PaymentQueryOptions {
  page?: number;
  limit?: number;
  type?: PaymentEntity["type"];
  status?: PaymentEntity["status"];
  search?: string;
  from?: number;
  to?: number;
}

/** Enum values whose name contains the search text (the Mongo regex matched them as text). */
const matchingValues = <T extends string>(values: readonly T[], search: string) =>
  values.filter((value) => value.toLowerCase().includes(search.toLowerCase()));

const buildUserWhere = (userId: string, options: PaymentQueryOptions): Prisma.PaymentWhereInput => {
  const where: Prisma.PaymentWhereInput = { usuarioId: userId };
  if (options.type) where.type = options.type as PaymentType;
  if (options.status) where.status = options.status as PaymentStatus;

  const search = options.search?.trim();
  if (search) {
    const contains = { contains: search, mode: "insensitive" as const };
    const types = matchingValues(PAYMENT_TYPES, search) as PaymentType[];
    const statuses = matchingValues(PAYMENT_STATUSES, search) as PaymentStatus[];
    where.OR = [
      { concept: contains },
      { referenceId: contains },
      { parkingName: contains },
      { parkingCity: contains },
      { paymentMethodBrand: contains },
      ...(types.length ? [{ type: { in: types } }] : []),
      ...(statuses.length ? [{ status: { in: statuses } }] : []),
    ];
  }
  if (options.from !== undefined || options.to !== undefined) {
    where.paidAt = {
      ...(options.from !== undefined ? { gte: new Date(options.from) } : {}),
      ...(options.to !== undefined ? { lte: new Date(options.to) } : {}),
    };
  }
  return where;
};

export class PaymentPostgresDatasource extends PaymentDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async create(payment: Omit<PaymentEntity, "id">): Promise<PaymentEntity> {
    const row = await this.db.payment.create({
      data: paymentColumns(payment) as Prisma.PaymentUncheckedCreateInput,
    });
    return toPaymentEntity(row);
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.payment.findUnique({ where: { id } });
    return row ? toPaymentEntity(row) : null;
  }

  async findByProviderReference(providerReference: string): Promise<PaymentEntity | null> {
    const row = await this.db.payment.findUnique({ where: { providerReference } });
    return row ? toPaymentEntity(row) : null;
  }

  async getByUser(userId: string, options: PaymentQueryOptions = {}): Promise<PaymentEntity[]> {
    if (!isUuid(userId)) return [];
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 10;
    const rows = await this.db.payment.findMany({
      where: buildUserWhere(userId, options),
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map(toPaymentEntity);
  }

  countByUser(userId: string, options: Omit<PaymentQueryOptions, "page" | "limit"> = {}): Promise<number> {
    if (!isUuid(userId)) return Promise.resolve(0);
    return this.db.payment.count({ where: buildUserWhere(userId, options) });
  }

  async update(id: string, payment: PaymentValues): Promise<PaymentEntity | null> {
    if (!isUuid(id)) return null;
    const result = await this.db.payment.updateMany({ where: { id }, data: paymentColumns(payment) });
    return result.count ? this.findById(id) : null;
  }
}
