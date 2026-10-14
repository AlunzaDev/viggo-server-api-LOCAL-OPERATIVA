import type { Prisma, UserApp } from "../../../generated/prisma/client";
import { UsuarioEntity, type UserAppPermission } from "../../../domain/entities/auth/usuario.entity";
import { isUuid, toEpochMs } from "../postgres/prisma-errors";
import type { PrismaDb } from "../system/transaction-runner.postgres";

export const usuarioInclude = {
  appPermissions: { select: { app: true, permissionProfileId: true } },
} satisfies Prisma.UsuarioInclude;

export type UsuarioRow = Prisma.UsuarioGetPayload<{ include: typeof usuarioInclude }>;

export const toUsuarioEntity = (row: UsuarioRow): UsuarioEntity =>
  UsuarioEntity.fromObject({
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    correo: row.correo,
    telefono: row.telefono,
    coordinates: row.coordinates,
    password: row.password,
    emailValidated: row.emailValidated,
    rol: row.rol,
    parkings: row.parkings,
    allowedApps: row.allowedApps,
    appPermissions: row.appPermissions,
    nacimiento: toEpochMs(row.nacimiento),
    img: row.img,
    estado: row.estado,
    google: row.google,
    barrierBlasterHighScore: row.barrierBlasterHighScore,
  });

/** Columns of the user that come from the cloud (local-only fields are left out). */
export const toUsuarioCloudData = (usuario: UsuarioEntity) => ({
  nombre: usuario.nombre,
  apellido: usuario.apellido,
  correo: usuario.correo.trim().toLowerCase(),
  telefono: usuario.telefono,
  coordinates: usuario.coordinates ?? [],
  password: usuario.password,
  emailValidated: usuario.emailValidated,
  rol: usuario.rol,
  // The column is uuid[]: ids of other systems can never match a project here.
  parkings: Array.from(new Set(usuario.parkings)).filter(isUuid),
  allowedApps: usuario.allowedApps as UserApp[],
  nacimiento: usuario.nacimiento === undefined ? null : new Date(usuario.nacimiento),
  img: usuario.img ?? "",
  estado: usuario.estado,
  google: usuario.google,
});

/** One profile per app; profiles with an invalid id can never be found, so they are dropped. */
export const toAppPermissionRows = (permissions: UserAppPermission[]) =>
  Array.from(new Map(permissions.map((permission) => [permission.app, permission])).values())
    .filter((permission) => isUuid(permission.permissionProfileId))
    .map((permission) => ({
      app: permission.app as UserApp,
      permissionProfileId: permission.permissionProfileId,
    }));

export type UsuarioLocalData = Omit<Prisma.UsuarioUncheckedUpdateInput, "id" | "appPermissions">;

/**
 * Creates or replaces a user (cloud columns + app permissions) inside `db`, which should be
 * a transaction. `localData` adds columns this server owns (sync metadata, high score).
 */
export const writeUsuario = async (db: PrismaDb, usuario: UsuarioEntity, localData: UsuarioLocalData = {}) => {
  if (!isUuid(usuario.id)) {
    throw new Error(`Invalid user id "${usuario.id}": users come from ADMINISTRATIVO with UUID ids.`);
  }
  const data = toUsuarioCloudData(usuario);
  const permissions = toAppPermissionRows(usuario.appPermissions);

  await db.usuario.upsert({
    where: { id: usuario.id },
    create: { ...data, ...(localData as Omit<Prisma.UsuarioUncheckedCreateInput, "id">), id: usuario.id },
    update: { ...data, ...localData },
  });
  await db.usuarioAppPermission.deleteMany({ where: { usuarioId: usuario.id } });
  if (permissions.length > 0) {
    await db.usuarioAppPermission.createMany({
      data: permissions.map((permission) => ({ usuarioId: usuario.id, ...permission })),
    });
  }
};
