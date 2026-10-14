import { Prisma } from "../../../generated/prisma/client";
import { PensionEntity, type PensionValidezItemEntity } from "../../../domain/entities/pension/pension.entity";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { fromEpochMsOrSentinel, isUuid, toEpochMsOrSentinel } from "../postgres/prisma-errors";
import type { PrismaDb } from "../system/transaction-runner.postgres";

// ───────────────────────────── Pension ─────────────────────────────

export const pensionInclude = { horarios: { orderBy: { weekDay: "asc" } } } satisfies Prisma.PensionInclude;
export type PensionRow = Prisma.PensionGetPayload<{ include: typeof pensionInclude }>;

const toHourMinute = (minutes: number) => [Math.floor(minutes / 60), minutes % 60];
const toMinutes = (value: number[]) => Number(value[0] ?? 0) * 60 + Number(value[1] ?? 0);

export const toPensionEntity = (row: PensionRow): PensionEntity =>
  PensionEntity.fromObject({
    id: row.id,
    proyecto: row.proyectoId,
    nombre: row.nombre,
    validez: row.horarios.map((horario) => ({
      weekDay: horario.weekDay,
      from: toHourMinute(horario.fromMinutes),
      to: toHourMinute(horario.toMinutes),
    })),
    precio: row.precio.toNumber(),
    descripcion: row.descripcion,
    estado: row.estado,
  });

export type PensionValues = Partial<Omit<PensionEntity, "id">>;

const horarioRows = (validez: PensionValidezItemEntity[]) =>
  validez.map((item) => ({
    weekDay: item.weekDay,
    fromMinutes: toMinutes(item.from),
    toMinutes: toMinutes(item.to),
  }));

/** Creates or updates a pension; the weekly validity replaces the stored one. */
export const writePension = async (db: PrismaDb, id: string, pension: PensionValues, create: boolean) => {
  const data: Prisma.PensionUncheckedUpdateInput = {};
  if (pension.proyecto !== undefined) data.proyectoId = pension.proyecto;
  if (pension.nombre !== undefined) data.nombre = pension.nombre;
  if (pension.precio !== undefined) data.precio = new Prisma.Decimal(pension.precio);
  if (pension.descripcion !== undefined || create) data.descripcion = pension.descripcion ?? "";
  if (pension.estado !== undefined) data.estado = pension.estado;

  if (create) {
    await db.pension.create({ data: { id, ...data } as Prisma.PensionUncheckedCreateInput });
  } else if (Object.keys(data).length > 0) {
    await db.pension.update({ where: { id }, data });
  }
  if (pension.validez !== undefined) {
    await db.pensionHorario.deleteMany({ where: { pensionId: id } });
    const rows = horarioRows(pension.validez);
    if (rows.length) await db.pensionHorario.createMany({ data: rows.map((row) => ({ pensionId: id, ...row })) });
  }
};

// ─────────────────────────── Pension pass ───────────────────────────

export type PensionPassRow = Prisma.PensionPassGetPayload<object>;

export const toPensionPassEntity = (row: PensionPassRow): PensionPassEntity =>
  PensionPassEntity.fromObject({
    id: row.id,
    usuario: row.usuarioId,
    name: row.name,
    pension: row.pensionId,
    idPass: row.idPass,
    vigent: row.vigent,
    antiPassback: row.antiPassback,
    inParking: row.inParking,
    created: row.created.getTime(),
    from: toEpochMsOrSentinel(row.validFrom),
    to: toEpochMsOrSentinel(row.validTo),
    estado: row.estado,
  });

export type PensionPassValues = Partial<Omit<PensionPassEntity, "id">>;

export const pensionPassColumns = (pass: PensionPassValues) => {
  const data: Prisma.PensionPassUncheckedUpdateInput = {};
  // null clears the holder; ids that are not UUIDs can never be a cloud user.
  if (pass.usuario !== undefined) data.usuarioId = isUuid(pass.usuario) ? pass.usuario : null;
  if (pass.name !== undefined) data.name = pass.name;
  if (pass.pension !== undefined) data.pensionId = pass.pension;
  if (pass.idPass !== undefined) data.idPass = pass.idPass;
  if (pass.vigent !== undefined) data.vigent = pass.vigent;
  if (pass.antiPassback !== undefined) data.antiPassback = pass.antiPassback;
  if (pass.inParking !== undefined) data.inParking = pass.inParking;
  if (pass.created !== undefined) data.created = new Date(pass.created);
  if (pass.from !== undefined) data.validFrom = fromEpochMsOrSentinel(pass.from);
  if (pass.to !== undefined) data.validTo = fromEpochMsOrSentinel(pass.to);
  if (pass.estado !== undefined) data.estado = pass.estado;
  return data;
};
