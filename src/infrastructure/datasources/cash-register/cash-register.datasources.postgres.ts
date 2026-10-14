import { PostgresDatabase } from "../../../data/postgres";
import type { CashRegisterShiftStatus, Prisma } from "../../../generated/prisma/client";
import { CashRegisterCountDatasource } from "../../../domain/datasources/cash-register/cash-register-count.datasource";
import { CashRegisterCutDatasource } from "../../../domain/datasources/cash-register/cash-register-cut.datasource";
import {
  CashRegisterModuleDatasource,
  type CashRegisterModuloProjection,
} from "../../../domain/datasources/cash-register/cash-register-module.datasource";
import { CashRegisterMovementDatasource } from "../../../domain/datasources/cash-register/cash-register-movement.datasource";
import {
  CashRegisterShiftDatasource,
  type CashRegisterShiftFilters,
} from "../../../domain/datasources/cash-register/cash-register-shift.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import type { CashRegisterCountEntity } from "../../../domain/entities/cash-register/cash-register-count.entity";
import type { CashRegisterCutEntity } from "../../../domain/entities/cash-register/cash-register-cut.entity";
import type { CashRegisterMovementEntity } from "../../../domain/entities/cash-register/cash-register-movement.entity";
import type { CashRegisterShiftEntity } from "../../../domain/entities/cash-register/cash-register-shift.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import {
  countInclude,
  countRow,
  cutRow,
  movementRow,
  shiftColumns,
  toCountEntity,
  toCutEntity,
  toMovementEntity,
  toShiftEntity,
  type ShiftValues,
} from "./cash-register.prisma-mapper";

const db = () => PostgresDatabase.client;
const missingShift = CustomError.badRequest("El turno de caja no existe");

export class CashRegisterShiftPostgresDatasource implements CashRegisterShiftDatasource {
  /** A second open shift for the same cash register raises UniqueConstraintError. */
  async create(shift: Omit<CashRegisterShiftEntity, "id">): Promise<CashRegisterShiftEntity> {
    const row = await withPrismaErrors(
      () => db().cashRegisterShift.create({ data: shiftColumns(shift) as Prisma.CashRegisterShiftUncheckedCreateInput }),
      { foreignKey: CustomError.badRequest("La caja del turno no existe") },
    );
    return toShiftEntity(row);
  }

  async findById(id: string): Promise<CashRegisterShiftEntity | null> {
    if (!isUuid(id)) return null;
    const row = await db().cashRegisterShift.findUnique({ where: { id } });
    return row ? toShiftEntity(row) : null;
  }

  async findOpenByModuloId(moduloId: string): Promise<CashRegisterShiftEntity | null> {
    if (!isUuid(moduloId)) return null;
    const row = await db().cashRegisterShift.findFirst({ where: { moduloId, status: "open" }, orderBy: { openedAt: "desc" } });
    return row ? toShiftEntity(row) : null;
  }

  async findOpenByUserId(userId: string): Promise<CashRegisterShiftEntity | null> {
    if (!isUuid(userId)) return null;
    const row = await db().cashRegisterShift.findFirst({
      where: { openedByUserId: userId, status: "open" },
      orderBy: { openedAt: "desc" },
    });
    return row ? toShiftEntity(row) : null;
  }

  async getByFilters(filters: CashRegisterShiftFilters): Promise<{ items: CashRegisterShiftEntity[]; total: number }> {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(filters.limit ?? 20)));
    if (filters.moduloId && !isUuid(filters.moduloId)) return { items: [], total: 0 };
    const where: Prisma.CashRegisterShiftWhereInput = {};
    if (filters.proyectoIds?.length) where.proyectoId = { in: filters.proyectoIds.filter(isUuid) };
    if (filters.moduloId) where.moduloId = filters.moduloId;
    if (filters.status) where.status = filters.status as CashRegisterShiftStatus;
    if (filters.dateFrom || filters.dateTo) {
      where.openedAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }
    const [total, rows] = await Promise.all([
      db().cashRegisterShift.count({ where }),
      db().cashRegisterShift.findMany({
        where,
        orderBy: [{ openedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, items: rows.map(toShiftEntity) };
  }

  async update(id: string, shift: ShiftValues): Promise<CashRegisterShiftEntity | null> {
    if (!isUuid(id)) return null;
    const result = await withPrismaErrors(() => db().cashRegisterShift.updateMany({ where: { id }, data: shiftColumns(shift) }));
    return result.count ? this.findById(id) : null;
  }
}

export class CashRegisterMovementPostgresDatasource implements CashRegisterMovementDatasource {
  /** A repeated idempotency key or cash session raises UniqueConstraintError. */
  async create(movement: Omit<CashRegisterMovementEntity, "id">): Promise<CashRegisterMovementEntity> {
    const row = await withPrismaErrors(() => db().cashRegisterMovement.create({ data: movementRow(movement) }), {
      foreignKey: missingShift,
    });
    return toMovementEntity(row);
  }

  async findById(id: string): Promise<CashRegisterMovementEntity | null> {
    if (!isUuid(id)) return null;
    const row = await db().cashRegisterMovement.findUnique({ where: { id } });
    return row ? toMovementEntity(row) : null;
  }

  async getByShiftId(shiftId: string): Promise<CashRegisterMovementEntity[]> {
    if (!isUuid(shiftId)) return [];
    const rows = await db().cashRegisterMovement.findMany({
      where: { shiftId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toMovementEntity);
  }

  async findByCashPaymentSessionId(cashPaymentSessionId: string): Promise<CashRegisterMovementEntity | null> {
    if (!isUuid(cashPaymentSessionId)) return null;
    const row = await db().cashRegisterMovement.findUnique({ where: { relatedCashPaymentSessionId: cashPaymentSessionId } });
    return row ? toMovementEntity(row) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<CashRegisterMovementEntity | null> {
    const row = await db().cashRegisterMovement.findUnique({ where: { idempotencyKey } });
    return row ? toMovementEntity(row) : null;
  }
}

export class CashRegisterCountPostgresDatasource implements CashRegisterCountDatasource {
  async create(count: Omit<CashRegisterCountEntity, "id">): Promise<CashRegisterCountEntity> {
    const row = await withPrismaErrors(
      () => db().cashRegisterCount.create({ data: countRow(count), include: countInclude }),
      { foreignKey: missingShift },
    );
    return toCountEntity(row);
  }

  async getByShiftId(shiftId: string): Promise<CashRegisterCountEntity[]> {
    if (!isUuid(shiftId)) return [];
    const rows = await db().cashRegisterCount.findMany({
      where: { shiftId },
      include: countInclude,
      orderBy: [{ countedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toCountEntity);
  }

  async getLatestByShiftId(shiftId: string): Promise<CashRegisterCountEntity | null> {
    if (!isUuid(shiftId)) return null;
    const row = await db().cashRegisterCount.findFirst({
      where: { shiftId },
      include: countInclude,
      orderBy: [{ countedAt: "desc" }, { id: "desc" }],
    });
    return row ? toCountEntity(row) : null;
  }
}

export class CashRegisterCutPostgresDatasource implements CashRegisterCutDatasource {
  /** A second cut for the same shift raises UniqueConstraintError. */
  async create(cut: Omit<CashRegisterCutEntity, "id">): Promise<CashRegisterCutEntity> {
    const row = await withPrismaErrors(() => db().cashRegisterCut.create({ data: cutRow(cut) }), {
      foreignKey: missingShift,
    });
    return toCutEntity(row);
  }

  async findByShiftId(shiftId: string): Promise<CashRegisterCutEntity | null> {
    if (!isUuid(shiftId)) return null;
    const row = await db().cashRegisterCut.findUnique({ where: { shiftId } });
    return row ? toCutEntity(row) : null;
  }
}

export class CashRegisterModulePostgresDatasource implements CashRegisterModuleDatasource {
  async findById(moduloId: string): Promise<CashRegisterModuloProjection | null> {
    if (!isUuid(moduloId)) return null;
    const modulo = await db().modulo.findUnique({
      where: { id: moduloId },
      select: { id: true, proyectoId: true, tipo: true, estado: true, identificador: true, nombre: true },
    });
    if (!modulo) return null;
    return {
      id: modulo.id,
      proyectoId: modulo.proyectoId,
      tipo: modulo.tipo,
      estado: modulo.estado,
      identificador: modulo.identificador.trim() || undefined,
      nombre: modulo.nombre.trim() || undefined,
    };
  }
}
