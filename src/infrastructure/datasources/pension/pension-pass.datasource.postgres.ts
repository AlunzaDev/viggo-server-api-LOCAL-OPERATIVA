import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import { PensionPassDatasource } from "../../../domain/datasources/pension/pension-pass.datasource";
import { CustomError } from "../../../domain/errors/custom.error";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { pensionPassColumns, toPensionPassEntity, type PensionPassValues } from "./pension.prisma-mapper";

const order = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * Pension passes are a projection of ADMINISTRATIVO; `inParking` (anti-passback) is the
 * only state this server owns.
 */
export class PensionPassPostgresDatasource extends PensionPassDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  private async findFirst(where: Prisma.PensionPassWhereInput): Promise<PensionPassEntity | null> {
    const row = await this.db.pensionPass.findFirst({ where, orderBy: order });
    return row ? toPensionPassEntity(row) : null;
  }

  private async findMany(where: Prisma.PensionPassWhereInput): Promise<PensionPassEntity[]> {
    const rows = await this.db.pensionPass.findMany({ where, orderBy: order });
    return rows.map(toPensionPassEntity);
  }

  async create(pensionPass: Omit<PensionPassEntity, "id">): Promise<PensionPassEntity> {
    const row = await withPrismaErrors(
      () =>
        this.db.pensionPass.create({
          data: { id: randomUUID(), ...pensionPassColumns(pensionPass) } as Prisma.PensionPassUncheckedCreateInput,
        }),
      { foreignKey: CustomError.badRequest("La pension del pension pass no existe") },
    );
    return toPensionPassEntity(row);
  }

  async findById(id: string): Promise<PensionPassEntity | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.pensionPass.findUnique({ where: { id } });
    return row ? toPensionPassEntity(row) : null;
  }

  findByIdPass(idPass: string): Promise<PensionPassEntity | null> {
    return this.findFirst({ idPass });
  }

  /** Free inventory: no holder and never contracted (was usuario null, from/to -1). */
  findAvailableByPension(pensionId: string): Promise<PensionPassEntity | null> {
    if (!isUuid(pensionId)) return Promise.resolve(null);
    return this.findFirst({ pensionId, usuarioId: null, validFrom: null, validTo: null, estado: true });
  }

  findByUsuarioAndPension(usuarioId: string, pensionId: string): Promise<PensionPassEntity | null> {
    if (!isUuid(usuarioId) || !isUuid(pensionId)) return Promise.resolve(null);
    return this.findFirst({ usuarioId, pensionId, estado: true });
  }

  getAll(): Promise<PensionPassEntity[]> {
    return this.findMany({});
  }

  getByPension(pensionId: string): Promise<PensionPassEntity[]> {
    if (!isUuid(pensionId)) return Promise.resolve([]);
    return this.findMany({ pensionId });
  }

  getByUsuario(usuarioId: string): Promise<PensionPassEntity[]> {
    if (!isUuid(usuarioId)) return Promise.resolve([]);
    return this.findMany({ usuarioId });
  }

  async update(id: string, pensionPass: PensionPassValues): Promise<PensionPassEntity | null> {
    if (!isUuid(id)) return null;
    const result = await withPrismaErrors(
      () => this.db.pensionPass.updateMany({ where: { id }, data: pensionPassColumns(pensionPass) }),
      { foreignKey: CustomError.badRequest("La pension del pension pass no existe") },
    );
    return result.count ? this.findById(id) : null;
  }

  async delete(id: string): Promise<PensionPassEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await withPrismaErrors(() => this.db.pensionPass.delete({ where: { id } }), {
      foreignKey: CustomError.conflict("El pension pass tiene movimientos registrados"),
    });
    return existing;
  }
}
