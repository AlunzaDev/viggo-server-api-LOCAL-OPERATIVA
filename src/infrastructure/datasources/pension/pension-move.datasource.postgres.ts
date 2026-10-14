import { PostgresDatabase } from "../../../data/postgres";
import type { PensionMove as PensionMoveRow, PensionMoveTipo as PensionMoveTipoColumn, Prisma } from "../../../generated/prisma/client";
import {
  PensionMoveDatasource,
  type PensionPassageInput,
} from "../../../domain/datasources/pension/pension-move.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { CustomError } from "../../../domain/errors/custom.error";
import {
  assertPensionPassage,
  PensionMoveEntity,
  type PensionMoveTipo,
} from "../../../domain/entities/pension/pension-move.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { lockRow } from "../postgres/row-locks";
import { prismaDb } from "../system/transaction-runner.postgres";

// The API names ("ENTRADA-PENSION") are not valid identifiers; the enum maps them.
const toColumnTipo = (tipo: PensionMoveTipo) => tipo.replace("-", "_") as PensionMoveTipoColumn;
const toApiTipo = (tipo: PensionMoveTipoColumn) => tipo.replace("_", "-") as PensionMoveTipo;

const toPensionMoveEntity = (row: PensionMoveRow): PensionMoveEntity =>
  PensionMoveEntity.fromObject({
    id: row.id,
    modulo: row.moduloId,
    proyecto: row.proyectoId,
    pensionPass: row.pensionPassId,
    tipo: toApiTipo(row.tipo),
    fecha: row.fecha.getTime(),
  });

const columns = (move: Partial<Omit<PensionMoveEntity, "id">>) => {
  const data: Prisma.PensionMoveUncheckedUpdateInput = {};
  if (move.modulo !== undefined) data.moduloId = move.modulo;
  if (move.proyecto !== undefined) data.proyectoId = move.proyecto;
  if (move.pensionPass !== undefined) data.pensionPassId = move.pensionPass;
  if (move.tipo !== undefined) data.tipo = toColumnTipo(move.tipo);
  if (move.fecha !== undefined) data.fecha = new Date(move.fecha);
  return data;
};

const invalidReference = CustomError.badRequest("El modulo, proyecto o pension pass del movimiento no existe");
const order = [{ fecha: "asc" as const }, { id: "asc" as const }];

export class PensionMovePostgresDatasource extends PensionMoveDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async create(pensionMove: Omit<PensionMoveEntity, "id">): Promise<PensionMoveEntity> {
    const row = await withPrismaErrors(
      () => this.db.pensionMove.create({ data: columns(pensionMove) as Prisma.PensionMoveUncheckedCreateInput }),
      { foreignKey: invalidReference },
    );
    return toPensionMoveEntity(row);
  }

  async findById(id: string): Promise<PensionMoveEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.pensionMove.findUnique({ where: { id } });
    return row ? toPensionMoveEntity(row) : null;
  }

  async getAll(): Promise<PensionMoveEntity[]> {
    return (await this.db.pensionMove.findMany({ orderBy: order })).map(toPensionMoveEntity);
  }

  async getByPensionPass(pensionPassId: string): Promise<PensionMoveEntity[]> {
    if (!isUuid(pensionPassId)) return [];
    return (await this.db.pensionMove.findMany({ where: { pensionPassId }, orderBy: order })).map(toPensionMoveEntity);
  }

  async getByProyecto(proyectoId: string): Promise<PensionMoveEntity[]> {
    if (!isUuid(proyectoId)) return [];
    return (await this.db.pensionMove.findMany({ where: { proyectoId }, orderBy: order })).map(toPensionMoveEntity);
  }

  async update(id: string, pensionMove: Partial<Omit<PensionMoveEntity, "id">>): Promise<PensionMoveEntity | null> {
    if (!isUuid(id)) return null;
    const result = await withPrismaErrors(
      () => this.db.pensionMove.updateMany({ where: { id }, data: columns(pensionMove) }),
      { foreignKey: invalidReference },
    );
    return result.count ? this.findById(id) : null;
  }

  async delete(id: string): Promise<PensionMoveEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.db.pensionMove.delete({ where: { id } });
    return existing;
  }

  async registerPassage(input: PensionPassageInput, tx?: TransactionContext): Promise<PensionMoveEntity> {
    if (!isUuid(input.pensionPassId)) throw CustomError.notFound("PensionPass no encontrado");

    const apply = async (db: Prisma.TransactionClient) => {
      await lockRow(db, "pension_passes", input.pensionPassId);
      const pass = await db.pensionPass.findUnique({ where: { id: input.pensionPassId }, select: { inParking: true } });
      if (!pass) throw CustomError.notFound("PensionPass no encontrado");
      assertPensionPassage(pass.inParking, input.tipo);

      await db.pensionPass.update({ where: { id: input.pensionPassId }, data: { inParking: input.tipo === "ENTRADA" } });
      return db.pensionMove.create({
        data: {
          pensionPassId: input.pensionPassId,
          moduloId: input.moduloId,
          proyectoId: input.proyectoId,
          tipo: toColumnTipo(input.tipo),
          fecha: new Date(input.fecha),
        },
      });
    };

    const row = await withPrismaErrors(
      () => (tx ? apply(prismaDb(tx)) : this.db.$transaction((db) => apply(db))),
      { foreignKey: invalidReference },
    );
    return toPensionMoveEntity(row);
  }
}
