import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import {
  normalizeUserModules,
  USER_APPS,
} from "../../../domain/constants";
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

const parseCoordinatePair = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
};

const normalizeProjectCoordinates = (value: unknown): unknown => {
  const directPair = parseCoordinatePair(value);
  if (directPair) return directPair;

  if (!Array.isArray(value)) return value;

  const source =
    Array.isArray(value[0]) && Array.isArray((value[0] as unknown[])[0])
      ? (value[0] as unknown[])
      : value;

  const points = source
    .map((point) => {
      const pair = parseCoordinatePair(point);
      if (pair) return pair;

      if (point && typeof point === "object") {
        const record = point as { longitude?: unknown; latitude?: unknown };
        const longitude = Number(record.longitude);
        const latitude = Number(record.latitude);
        if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
          return [longitude, latitude] as [number, number];
        }
      }

      return null;
    })
    .filter((point): point is [number, number] => Boolean(point));

  return points.length >= 3 ? points : value;
};

const normalizeSnapshotItem = (item: SnapshotItem): SnapshotItem => {
  const normalized = { ...item };

  if ("coordinates" in normalized) {
    normalized.coordinates = normalizeProjectCoordinates(normalized.coordinates);
  }

  return normalized;
};

const validSnapshotItems = (items: SnapshotItem[]) =>
  items.filter((item) => getSnapshotId(item));

const normalizeOperativeProfile = (item: SnapshotItem): SnapshotItem | null => {
  if (item.app !== USER_APPS.OPERATIVE_WEB) return null;
  const modules = normalizeUserModules(item.modules);
  if (modules.length === 0) return null;
  return {
    ...item,
    app: USER_APPS.OPERATIVE_WEB,
    modules,
  };
};

const normalizeOperativeUser = (item: SnapshotItem): SnapshotItem | null => {
  const allowedApps = Array.isArray(item.allowedApps)
    ? item.allowedApps.filter((app) => app === USER_APPS.OPERATIVE_WEB)
    : [];
  const appPermissions = Array.isArray(item.appPermissions)
    ? item.appPermissions.filter((permission) => {
        if (!permission || typeof permission !== "object") return false;
        return (permission as Record<string, unknown>).app === USER_APPS.OPERATIVE_WEB;
      })
    : [];

  if (allowedApps.length === 0 || appPermissions.length === 0) return null;

  return {
    ...item,
    allowedApps,
    appPermissions,
  };
};

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
  const normalizedItem = normalizeSnapshotItem(item);
  const id = getSnapshotId(normalizedItem);
  const current = await model.findById(id).lean();
  const diff = diffSnapshotUpdate(current, normalizedItem);

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
    const validUsers = validSnapshotItems(payload.users)
      .map(normalizeOperativeUser)
      .filter((user): user is SnapshotItem => Boolean(user));
    const validProfiles = validSnapshotItems(payload.permissionProfiles)
      .map(normalizeOperativeProfile)
      .filter((profile): profile is SnapshotItem => Boolean(profile));

    const profileResults = await Promise.all(
      validProfiles.map((profile) =>
        applyChangedSnapshot(PermissionProfileModel, profile),
      ),
    );

    const userResults = await Promise.all(
      validUsers.map((user) => applyChangedSnapshot(UsuarioModel, user)),
    );

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
