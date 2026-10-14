// Normalization of the snapshots ADMINISTRATIVO sends before they are stored.
import { normalizeUserModules, USER_APPS } from "../../../domain/constants";
import type { SnapshotApplySummary, SnapshotItem } from "../../../domain/datasources/sync/sync.datasource";

export const getSnapshotId = (item: SnapshotItem): string => {
  const id = item.id ?? item._id;
  if (typeof id === "string") return id.trim();
  if (id && typeof id === "object") {
    const source = id as Record<string, unknown>;
    return String(source.$oid ?? source.id ?? source._id ?? "").trim();
  }
  return "";
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

export const normalizeSnapshotItem = (item: SnapshotItem): SnapshotItem => {
  const normalized = { ...item };

  if ("coordinates" in normalized) {
    normalized.coordinates = normalizeProjectCoordinates(normalized.coordinates);
  }

  return normalized;
};

export const validSnapshotItems = (items: SnapshotItem[]) =>
  items.filter((item) => getSnapshotId(item));

/** Only OPERATIVE_WEB profiles with at least one module are useful here. */
export const normalizeOperativeProfile = (item: SnapshotItem): SnapshotItem | null => {
  if (item.app !== USER_APPS.OPERATIVE_WEB) return null;
  const modules = normalizeUserModules(item.modules);
  if (modules.length === 0) return null;
  return {
    ...item,
    app: USER_APPS.OPERATIVE_WEB,
    modules,
  };
};

/** Keeps only the OPERATIVE_WEB access of a user; users without it are not stored. */
export const normalizeOperativeUser = (item: SnapshotItem): SnapshotItem | null => {
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

export type SnapshotItemResult = { created: boolean; updated: boolean; unchanged: boolean };

export const summarizeResults = (results: SnapshotItemResult[]): SnapshotApplySummary => ({
  received: results.length,
  created: results.filter((item) => item.created).length,
  updated: results.filter((item) => item.updated).length,
  unchanged: results.filter((item) => item.unchanged).length,
});
