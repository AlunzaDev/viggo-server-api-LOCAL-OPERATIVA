import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import {
  SyncDatasource,
  type AccessSnapshotPayload,
  type AccessSnapshotResult,
  type ConfigurationSnapshotPayload,
  type ConfigurationSnapshotResult,
  type SnapshotItem,
} from "../../../domain/datasources/sync/sync.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { ProyectoEntity } from "../../../domain/entities/parking/proyecto.entity";
import { PensionEntity } from "../../../domain/entities/pension/pension.entity";
import { PensionPassEntity } from "../../../domain/entities/pension/pension-pass.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { permissionProfileColumns, toPermissionProfileEntity } from "../auth/permission-profile.datasource.postgres";
import { toUsuarioEntity, usuarioInclude, writeUsuario } from "../auth/usuario.prisma-mapper";
import {
  MODULO_CLOUD_KEYS,
  PROYECTO_KEYS,
  proyectoInclude,
  toModuloEntity,
  toProyectoEntity,
  writeModulo,
  writeProyecto,
} from "../parking/parking.prisma-mapper";
import {
  pensionInclude,
  pensionPassColumns,
  toPensionEntity,
  toPensionPassEntity,
  writePension,
} from "../pension/pension.prisma-mapper";
import { isUuid, withPrismaErrors } from "../postgres/prisma-errors";
import { prismaDb, type PrismaDb } from "../system/transaction-runner.postgres";
import {
  getSnapshotId,
  normalizeOperativeProfile,
  normalizeOperativeUser,
  normalizeSnapshotItem,
  summarizeResults,
  type SnapshotItemResult,
} from "./sync.normalizers";

/** How to store one kind of projection. */
interface ProjectionSpec<E> {
  kind: string;
  /** Snapshot item -> entity (validates it); `existing` lets local-only state survive. */
  parse(item: SnapshotItem, existing: E | undefined): E;
  findExisting(db: PrismaDb, ids: string[]): Promise<E[]>;
  /** The part of the entity that comes from the cloud, to detect unchanged items. */
  cloudView(entity: E): unknown;
  write(db: PrismaDb, entity: E, create: boolean): Promise<unknown>;
}

const snapshotId = (item: SnapshotItem, kind: string) => {
  const id = getSnapshotId(item);
  if (!isUuid(id)) {
    throw CustomError.badRequest(`El snapshot trae un ${kind} con id invalido`, { id }, "SYNC_INVALID_ID");
  }
  return id;
};

// Empty values compare equal: the entities turn "" into undefined, the columns store "".
const emptyAsMissing = (_key: string, value: unknown) => (value === "" || value === null ? undefined : value);
const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left, emptyAsMissing) === JSON.stringify(right, emptyAsMissing);

const pick = <T extends object, K extends keyof T>(source: T, keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<T, K>;

/** Upserts the items in order; the last copy of a repeated id wins. */
const applyProjection = async <E extends { id: string }>(
  db: PrismaDb,
  items: SnapshotItem[],
  spec: ProjectionSpec<E>,
): Promise<SnapshotItemResult[]> => {
  const byId = new Map(items.map((item) => [snapshotId(item, spec.kind), item]));
  if (byId.size === 0) return [];
  const existing = new Map((await spec.findExisting(db, [...byId.keys()])).map((entity) => [entity.id, entity]));

  const results: SnapshotItemResult[] = [];
  for (const [id, item] of byId) {
    const current = existing.get(id);
    const entity = spec.parse({ ...item, id }, current);
    if (current && sameJson(spec.cloudView(current), spec.cloudView(entity))) {
      results.push({ created: false, updated: false, unchanged: true });
      continue;
    }
    await spec.write(db, entity, !current);
    results.push({ created: !current, updated: Boolean(current), unchanged: false });
  }
  return results;
};

const proyectoSpec: ProjectionSpec<ProyectoEntity> = {
  kind: "proyecto",
  parse: (item) => ProyectoEntity.fromObject(normalizeSnapshotItem(item)),
  findExisting: async (db, ids) =>
    (await db.proyecto.findMany({ where: { id: { in: ids } }, include: proyectoInclude })).map(toProyectoEntity),
  cloudView: (proyecto) => proyecto,
  write: (db, { id, ...proyecto }, create) => writeProyecto(db, id, proyecto, { create, replace: PROYECTO_KEYS }),
};

const moduloSpec: ProjectionSpec<ModuloEntity> = {
  kind: "modulo",
  // The cloud sends the configuration only; the device state stays as stored here.
  parse: (item) => ModuloEntity.fromObject(item),
  // Only the cloud fields are compared, loaded one query at a time: inside the sync
  // transaction an `include` of several relations runs them in parallel on its single
  // connection, which pg@9 will reject (#12).
  findExisting: async (db, ids) => {
    const rows = await db.modulo.findMany({ where: { id: { in: ids } } });
    const submodulos = await db.submodulo.findMany({ where: { moduloId: { in: ids } }, orderBy: { position: "asc" } });
    const remoteSupports = await db.moduloRemoteSupport.findMany({ where: { moduloId: { in: ids } } });
    return rows.map((row) =>
      toModuloEntity({
        ...row,
        submodulos: submodulos.filter((submodulo) => submodulo.moduloId === row.id),
        remoteSupport: remoteSupports.find((support) => support.moduloId === row.id) ?? null,
        deviceBinding: null,
        bindingRequests: [],
        connectionAudit: null,
        deviceRuntime: null,
      }),
    );
  },
  cloudView: (modulo) => pick(modulo, MODULO_CLOUD_KEYS),
  write: (db, modulo, create) =>
    writeModulo(db, modulo.id, pick(modulo, MODULO_CLOUD_KEYS), { create, replace: MODULO_CLOUD_KEYS }),
};

const pensionSpec: ProjectionSpec<PensionEntity> = {
  kind: "pension",
  parse: (item) => PensionEntity.fromObject(item),
  findExisting: async (db, ids) =>
    (await db.pension.findMany({ where: { id: { in: ids } }, include: pensionInclude })).map(toPensionEntity),
  cloudView: (pension) => pension,
  write: (db, { id, ...pension }, create) => writePension(db, id, pension, create),
};

const pensionPassSpec: ProjectionSpec<PensionPassEntity> = {
  kind: "pension pass",
  // inParking (anti-passback) is local: keep the stored value, false for a new pass.
  parse: (item, existing) => PensionPassEntity.fromObject({ ...item, inParking: existing?.inParking ?? false }),
  findExisting: async (db, ids) => (await db.pensionPass.findMany({ where: { id: { in: ids } } })).map(toPensionPassEntity),
  cloudView: (pass) => pass,
  write: async (db, { id, inParking, ...pass }, create) => {
    const data = pensionPassColumns(pass);
    return create
      ? db.pensionPass.create({ data: { ...data, id, inParking } as Prisma.PensionPassUncheckedCreateInput })
      : db.pensionPass.update({ where: { id }, data });
  },
};

const usuarioSpec: ProjectionSpec<UsuarioEntity> = {
  kind: "usuario",
  parse: (item) => UsuarioEntity.fromObject(item),
  findExisting: async (db, ids) =>
    (await db.usuario.findMany({ where: { id: { in: ids } }, include: usuarioInclude })).map(toUsuarioEntity),
  // The high score is local; everything else comes from the cloud.
  cloudView: ({ barrierBlasterHighScore: _local, ...usuario }) => usuario,
  write: (db, usuario) => writeUsuario(db, usuario),
};

const permissionProfileSpec: ProjectionSpec<PermissionProfileEntity> = {
  kind: "perfil de permisos",
  parse: (item) => PermissionProfileEntity.fromObject(item),
  findExisting: async (db, ids) =>
    (await db.permissionProfile.findMany({ where: { id: { in: ids } } })).map(toPermissionProfileEntity),
  cloudView: (profile) => profile,
  write: (db, { id, ...profile }) => {
    const data = permissionProfileColumns(profile);
    return db.permissionProfile.upsert({ where: { id }, create: { id, ...data }, update: data });
  },
};

const invalidReference = CustomError.badRequest(
  "El snapshot referencia datos que no existen en esta instalacion",
  undefined,
  "SYNC_INVALID_REFERENCE",
);

export class SyncPostgresDatasource implements SyncDatasource {
  /** Runs inside `tx` when given, otherwise in its own transaction. */
  private inTransaction<T>(tx: TransactionContext | undefined, work: (db: PrismaDb) => Promise<T>): Promise<T> {
    const run = () =>
      tx ? work(prismaDb(tx)) : PostgresDatabase.client.$transaction((db) => work(db), { timeout: 60_000, maxWait: 10_000 });
    return withPrismaErrors(run, { foreignKey: invalidReference });
  }

  applyAccessSnapshot(payload: AccessSnapshotPayload, tx?: TransactionContext): Promise<AccessSnapshotResult> {
    const users = payload.users.map(normalizeOperativeUser).filter((user): user is SnapshotItem => Boolean(user));
    const profiles = payload.permissionProfiles
      .map(normalizeOperativeProfile)
      .filter((profile): profile is SnapshotItem => Boolean(profile));

    return this.inTransaction(tx, async (db) => {
      const profileResults = await applyProjection(db, profiles, permissionProfileSpec);
      const userResults = await applyProjection(db, users, usuarioSpec);
      return {
        users: users.length,
        permissionProfiles: profiles.length,
        details: {
          users: summarizeResults(userResults),
          permissionProfiles: summarizeResults(profileResults),
        },
      };
    });
  }

  applyConfigurationSnapshot(
    payload: ConfigurationSnapshotPayload,
    tx?: TransactionContext,
  ): Promise<ConfigurationSnapshotResult> {
    const proyectos = payload.proyecto ? [payload.proyecto] : [];

    // Parents first: modules and pensions reference the project, passes reference pensions.
    return this.inTransaction(tx, async (db) => {
      const proyectoResults = await applyProjection(db, proyectos, proyectoSpec);
      const moduloResults = await applyProjection(db, payload.modulos, moduloSpec);
      const pensionResults = await applyProjection(db, payload.pensiones, pensionSpec);
      const pensionPassResults = await applyProjection(db, payload.pensionPasses, pensionPassSpec);
      return {
        proyecto: proyectos.length,
        modulos: payload.modulos.length,
        pensiones: payload.pensiones.length,
        pensionPasses: payload.pensionPasses.length,
        details: {
          proyecto: summarizeResults(proyectoResults),
          modulos: summarizeResults(moduloResults),
          pensiones: summarizeResults(pensionResults),
          pensionPasses: summarizeResults(pensionPassResults),
        },
      };
    });
  }
}
