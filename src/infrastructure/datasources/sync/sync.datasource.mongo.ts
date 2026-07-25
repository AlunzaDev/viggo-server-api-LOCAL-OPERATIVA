import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import {
  SyncDatasource,
  type AccessSnapshotPayload,
  type ConfigurationSnapshotPayload,
  type SnapshotItem,
} from "../../../domain/datasources/sync/sync.datasource";

type SyncModel = {
  findById(id: string): { lean(): Promise<Record<string, unknown> | null> };
  findByIdAndUpdate(
    id: string,
    update: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<unknown>;
};

const getSnapshotId = (item: SnapshotItem): string => {
  const id = item.id ?? item._id;
  if (typeof id === "string") return id.trim();
  if (id && typeof id === "object") {
    const source = id as Record<string, unknown>;
    return String(source.$oid ?? source.id ?? source._id ?? "").trim();
  }
  return "";
};

const toObjectIdUpdate = (item: SnapshotItem) => {
  const { id, _id, ...rest } = item;
  return { _id: getSnapshotId(item), ...rest };
};

const validSnapshotItems = (items: SnapshotItem[]) =>
  items.filter((item) => getSnapshotId(item));

const normalizeComparable = (value: unknown): unknown => {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeComparable(item));

  if (typeof value === "object") {
    const source = value as Record<string, unknown> & { toHexString?: () => string };
    if (typeof source.toHexString === "function") return source.toHexString();

    return Object.keys(source)
      .filter((key) => key !== "__v")
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeComparable(source[key]);
        return acc;
      }, {});
  }

  return value;
};

const areEqual = (left: unknown, right: unknown) =>
  JSON.stringify(normalizeComparable(left)) === JSON.stringify(normalizeComparable(right));

const diffSnapshotUpdate = (
  current: Record<string, unknown> | null,
  incoming: SnapshotItem,
) => {
  const next = toObjectIdUpdate(incoming);
  const { _id, ...fields } = next;
  const set: Record<string, unknown> = {};

  if (!current) return { set: fields, changed: true, created: true };

  Object.entries(fields).forEach(([key, value]) => {
    if (!areEqual(current[key], value)) {
      set[key] = value;
    }
  });

  return {
    set,
    changed: Object.keys(set).length > 0,
    created: false,
  };
};

const applyChangedSnapshot = async (model: SyncModel, item: SnapshotItem) => {
  const id = getSnapshotId(item);
  const current = await model.findById(id).lean();
  const diff = diffSnapshotUpdate(current, item);

  if (!diff.changed) {
    return { created: false, updated: false, unchanged: true };
  }

  await model.findByIdAndUpdate(
    id,
    { $set: { _id: id, ...diff.set } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );

  return { created: diff.created, updated: !diff.created, unchanged: false };
};

const summarizeResults = (
  results: Array<{ created: boolean; updated: boolean; unchanged: boolean }>,
) => ({
  received: results.length,
  created: results.filter((item) => item.created).length,
  updated: results.filter((item) => item.updated).length,
  unchanged: results.filter((item) => item.unchanged).length,
});

export class SyncMongoDatasource implements SyncDatasource {
  async applyAccessSnapshot(payload: AccessSnapshotPayload) {
    const validUsers = validSnapshotItems(payload.users);
    const validProfiles = validSnapshotItems(payload.permissionProfiles);

    const [profileResults, userResults] = await Promise.all([
      Promise.all(validProfiles.map((profile) => applyChangedSnapshot(PermissionProfileModel, profile))),
      Promise.all(validUsers.map((user) => applyChangedSnapshot(UsuarioModel, user))),
    ]);

    return {
      users: validUsers.length,
      permissionProfiles: validProfiles.length,
      details: {
        users: summarizeResults(userResults),
        permissionProfiles: summarizeResults(profileResults),
      },
    };
  }

  async applyConfigurationSnapshot(payload: ConfigurationSnapshotPayload) {
    const proyecto = payload.proyecto && getSnapshotId(payload.proyecto)
      ? payload.proyecto
      : null;
    const validModulos = validSnapshotItems(payload.modulos);
    const validPensiones = validSnapshotItems(payload.pensiones);
    const validPensionPasses = validSnapshotItems(payload.pensionPasses);

    const [proyectoResults, moduloResults, pensionResults, pensionPassResults] =
      await Promise.all([
        proyecto
          ? Promise.all([applyChangedSnapshot(ProyectoModel, proyecto)])
          : Promise.resolve([]),
        Promise.all(validModulos.map((modulo) => applyChangedSnapshot(ModuloModel, modulo))),
        Promise.all(validPensiones.map((pension) => applyChangedSnapshot(PensionModel, pension))),
        Promise.all(validPensionPasses.map((pensionPass) => applyChangedSnapshot(PensionPassModel, pensionPass))),
      ]);

    return {
      proyecto: proyecto ? 1 : 0,
      modulos: validModulos.length,
      pensiones: validPensiones.length,
      pensionPasses: validPensionPasses.length,
      details: {
        proyecto: summarizeResults(proyectoResults),
        modulos: summarizeResults(moduloResults),
        pensiones: summarizeResults(pensionResults),
        pensionPasses: summarizeResults(pensionPassResults),
      },
    };
  }
}
