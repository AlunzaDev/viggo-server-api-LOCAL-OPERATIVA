import { DEFAULT_TIME_ZONE } from "../../../domain/entities/parking/time-zone";
import type {
  DeviceApprovalStatus,
  DeviceConnectionStatus,
  ModuloTipo,
  Prisma,
  RemoteSupportProvider,
  SubmoduloTipo,
} from "../../../generated/prisma/client";
import {
  ModuloEntity,
  type ModuloDeviceBinding,
  type ModuloDeviceBindingRequest,
  type ModuloDeviceConnectionAudit,
  type ModuloDeviceRuntime,
  type ModuloRemoteSupport,
  type ModuloSubmodulo,
  type ModuloUpdateValues,
} from "../../../domain/entities/parking/modulo.entity";
import { ProyectoEntity, type ProyectoRemoteSupport } from "../../../domain/entities/parking/proyecto.entity";
import type { PrismaDb } from "../system/transaction-runner.postgres";

/**
 * How a write treats keys whose value is undefined: a patch leaves those columns alone
 * (like Mongoose dropped undefined keys); `replace` lists keys that must be written anyway,
 * clearing them, because the whole record is being stored (create or cloud sync).
 */
export interface WriteMode<K extends string> {
  create: boolean;
  replace?: readonly K[];
}

const presentIn = <K extends string>(values: object, mode: WriteMode<K>) => (key: K) =>
  (values as Record<string, unknown>)[key] !== undefined || (mode.replace ?? []).includes(key);

// ───────────────────────────── Proyecto ─────────────────────────────

export const proyectoInclude = { remoteSupport: true } satisfies Prisma.ProyectoInclude;
export type ProyectoRow = Prisma.ProyectoGetPayload<{ include: typeof proyectoInclude }>;

export const toProyectoEntity = (row: ProyectoRow): ProyectoEntity =>
  ProyectoEntity.fromObject({
    id: row.id,
    nombre: row.nombre,
    coordinates: row.coordinates,
    ciudad: row.ciudad,
    direccion: row.direccion,
    identificador: row.identificador,
    codigoProyecto: row.codigoProyecto ?? undefined,
    serverIp: row.serverIp,
    serverMac: row.serverMac,
    localApiBaseUrl: row.localApiBaseUrl,
    remoteSupport: row.remoteSupport,
    img: row.img,
    descripcion: row.descripcion,
    zonaHoraria: row.zonaHoraria,
    estado: row.estado,
  });

export type ProyectoValues = Partial<Omit<ProyectoEntity, "id">>;
export type ProyectoKey = keyof ProyectoValues;

/** Every key of a project, for writes that store the whole record. */
export const PROYECTO_KEYS: readonly ProyectoKey[] = [
  "nombre", "coordinates", "ciudad", "direccion", "identificador", "codigoProyecto", "serverIp",
  "serverMac", "localApiBaseUrl", "remoteSupport", "img", "descripcion", "zonaHoraria", "estado",
];

const proyectoColumns = (proyecto: ProyectoValues, has: (key: ProyectoKey) => boolean) => {
  const data: Prisma.ProyectoUncheckedUpdateInput = {};
  if (has("nombre")) data.nombre = proyecto.nombre;
  if (has("coordinates")) data.coordinates = proyecto.coordinates as Prisma.InputJsonValue;
  if (has("ciudad")) data.ciudad = proyecto.ciudad;
  if (has("direccion")) data.direccion = proyecto.direccion ?? "";
  if (has("identificador")) data.identificador = proyecto.identificador;
  if (has("codigoProyecto")) data.codigoProyecto = proyecto.codigoProyecto ?? null;
  if (has("serverIp")) data.serverIp = proyecto.serverIp ?? "";
  if (has("serverMac")) data.serverMac = proyecto.serverMac ?? "";
  if (has("localApiBaseUrl")) data.localApiBaseUrl = proyecto.localApiBaseUrl ?? "";
  if (has("img")) data.img = proyecto.img ?? "";
  if (has("descripcion")) data.descripcion = proyecto.descripcion ?? "";
  if (has("zonaHoraria")) data.zonaHoraria = proyecto.zonaHoraria ?? DEFAULT_TIME_ZONE;
  if (has("estado")) data.estado = proyecto.estado;
  return data;
};

const proyectoRemoteSupportColumns = (support: ProyectoRemoteSupport) => ({
  provider: support.provider as RemoteSupportProvider,
  enabled: support.enabled,
  baseUrl: support.baseUrl ?? "",
  groupId: support.groupId ?? "",
});

/** Creates or updates a project and its remote support (null removes it). */
export const writeProyecto = async (
  db: PrismaDb,
  id: string,
  proyecto: ProyectoValues,
  mode: WriteMode<ProyectoKey>,
) => {
  const has = presentIn(proyecto, mode);
  const data = proyectoColumns(proyecto, has);
  if (mode.create) {
    await db.proyecto.create({ data: { id, ...data } as Prisma.ProyectoUncheckedCreateInput });
  } else if (Object.keys(data).length > 0) {
    await db.proyecto.update({ where: { id }, data });
  }

  if (has("remoteSupport")) {
    if (proyecto.remoteSupport) {
      const columns = proyectoRemoteSupportColumns(proyecto.remoteSupport);
      await db.proyectoRemoteSupport.upsert({
        where: { proyectoId: id },
        create: { proyectoId: id, ...columns, updatedAt: new Date() },
        update: { ...columns, updatedAt: new Date() },
      });
    } else {
      await db.proyectoRemoteSupport.deleteMany({ where: { proyectoId: id } });
    }
  }
};

// ───────────────────────────── Modulo ─────────────────────────────

export const moduloInclude = {
  submodulos: { orderBy: { position: "asc" } },
  remoteSupport: true,
  deviceBinding: true,
  bindingRequests: { orderBy: [{ requestedAt: "asc" }, { id: "asc" }] },
  connectionAudit: true,
  deviceRuntime: true,
} satisfies Prisma.ModuloInclude;
export type ModuloRow = Prisma.ModuloGetPayload<{ include: typeof moduloInclude }>;

const toCoordinates = (longitude: number | null, latitude: number | null) =>
  longitude !== null && latitude !== null ? [longitude, latitude] : undefined;

/** [lon, lat] -> columns; anything else clears them. */
const fromCoordinates = (coordinates: [number, number] | undefined) =>
  coordinates ? { longitude: coordinates[0], latitude: coordinates[1] } : { longitude: null, latitude: null };

export const toModuloEntity = (row: ModuloRow): ModuloEntity =>
  ModuloEntity.fromObject({
    id: row.id,
    nombre: row.nombre,
    proyecto: row.proyectoId,
    tipo: row.tipo,
    estado: row.estado,
    identificador: row.identificador,
    ip: row.ip,
    mac: row.mac,
    ubicacion: row.ubicacion,
    coordinates: toCoordinates(row.longitude, row.latitude),
    descripcion: row.descripcion,
    remoteSupport: row.remoteSupport,
    submodulos: row.submodulos.map((submodulo) => ({
      ...submodulo,
      coordinates: toCoordinates(submodulo.longitude, submodulo.latitude),
    })),
    deviceBinding: row.deviceBinding,
    deviceBindingRequests: row.bindingRequests,
    // The entity requires attemptedAt; an audit without it carries no information.
    deviceConnectionAudit: row.connectionAudit?.attemptedAt ? row.connectionAudit : null,
    deviceRuntime: row.deviceRuntime,
  });

export type ModuloKey = keyof ModuloUpdateValues;

/** Module keys owned by ADMINISTRATIVO (the device state is local). */
export const MODULO_CLOUD_KEYS: readonly ModuloKey[] = [
  "nombre", "proyecto", "tipo", "estado", "identificador", "ip", "mac", "ubicacion", "coordinates",
  "descripcion", "remoteSupport", "submodulos",
];

/** Every key of a module, for writes that store the whole record. */
export const MODULO_KEYS: readonly ModuloKey[] = [
  ...MODULO_CLOUD_KEYS,
  "deviceBinding", "deviceBindingRequests", "deviceConnectionAudit", "deviceRuntime",
];

const moduloColumns = (modulo: ModuloUpdateValues, has: (key: ModuloKey) => boolean) => {
  const data: Prisma.ModuloUncheckedUpdateInput = {};
  if (has("nombre")) data.nombre = modulo.nombre;
  if (has("proyecto")) data.proyectoId = modulo.proyecto;
  if (has("tipo")) data.tipo = modulo.tipo as ModuloTipo;
  if (has("estado")) data.estado = modulo.estado;
  if (has("identificador")) data.identificador = modulo.identificador;
  if (has("ip")) data.ip = modulo.ip ?? "";
  if (has("mac")) data.mac = modulo.mac ?? "";
  if (has("ubicacion")) data.ubicacion = modulo.ubicacion ?? "";
  if (has("coordinates")) Object.assign(data, fromCoordinates(modulo.coordinates));
  if (has("descripcion")) data.descripcion = modulo.descripcion ?? "";
  return data;
};

const submoduloRows = (submodulos: ModuloSubmodulo[]) =>
  submodulos.map((submodulo, position) => ({
    submoduloId: submodulo.submoduloId,
    position,
    nombre: submodulo.nombre,
    tipo: submodulo.tipo as SubmoduloTipo,
    identificador: submodulo.identificador ?? "",
    ip: submodulo.ip ?? "",
    mac: submodulo.mac ?? "",
    ubicacion: submodulo.ubicacion ?? "",
    ...fromCoordinates(submodulo.coordinates),
    descripcion: submodulo.descripcion ?? "",
    estado: submodulo.estado,
  }));

const remoteSupportColumns = (support: ModuloRemoteSupport) => ({
  provider: support.provider as RemoteSupportProvider,
  enabled: support.enabled,
  deviceName: support.deviceName ?? "",
  deviceId: support.deviceId ?? "",
  groupId: support.groupId ?? "",
  baseUrl: support.baseUrl ?? "",
  supportUrl: support.supportUrl ?? "",
  desktopUrl: support.desktopUrl ?? "",
  terminalUrl: support.terminalUrl ?? "",
  linkedAt: support.linkedAt ?? null,
  updatedAt: support.updatedAt ?? null,
});

const bindingColumns = (binding: ModuloDeviceBinding) => ({
  fingerprint: binding.fingerprint,
  cpuSerial: binding.cpuSerial ?? "",
  machineId: binding.machineId ?? "",
  primaryMac: binding.primaryMac ?? "",
  deviceSecretHash: binding.deviceSecretHash ?? "",
  deviceSecretIssuedAt: binding.deviceSecretIssuedAt ?? null,
  boundAt: binding.boundAt,
  lastSeenAt: binding.lastSeenAt,
});

const bindingRequestRow = (request: ModuloDeviceBindingRequest) => ({
  fingerprint: request.fingerprint,
  cpuSerial: request.cpuSerial ?? "",
  machineId: request.machineId ?? "",
  primaryMac: request.primaryMac ?? "",
  ipAddress: request.ipAddress ?? "",
  locationLabel: request.locationLabel ?? "",
  status: request.status as DeviceApprovalStatus,
  requestedAt: request.requestedAt,
  resolvedAt: request.resolvedAt ?? null,
  notes: request.notes ?? "",
});

const connectionAuditColumns = (audit: ModuloDeviceConnectionAudit) => ({
  fingerprint: audit.fingerprint ?? "",
  cpuSerial: audit.cpuSerial ?? "",
  machineId: audit.machineId ?? "",
  primaryMac: audit.primaryMac ?? "",
  ipAddress: audit.ipAddress ?? "",
  locationLabel: audit.locationLabel ?? "",
  socketId: audit.socketId ?? "",
  status: audit.status as DeviceApprovalStatus,
  reason: audit.reason ?? "",
  attemptedAt: audit.attemptedAt,
});

const runtimeColumns = (runtime: ModuloDeviceRuntime) => ({
  fingerprint: runtime.fingerprint ?? "",
  socketId: runtime.socketId ?? "",
  ipAddress: runtime.ipAddress ?? "",
  locationLabel: runtime.locationLabel ?? "",
  connectionStatus: runtime.connectionStatus as DeviceConnectionStatus,
  isConnected: runtime.isConnected,
  isAuthorized: runtime.isAuthorized,
  connectedAt: runtime.connectedAt ?? null,
  lastHeartbeatAt: runtime.lastHeartbeatAt ?? null,
  lastDisconnectAt: runtime.lastDisconnectAt ?? null,
  message: runtime.message ?? "",
});

/** Upserts a 1:1 child row, or deletes it when the value is null. */
const writeOneToOne = async <T>(
  value: T | null | undefined,
  write: (value: T) => Promise<unknown>,
  remove: () => Promise<unknown>,
) => (value ? write(value) : remove());

/**
 * Creates or updates a module. Lists (sub-modules, binding requests) replace the stored
 * ones, like the Mongo array fields did; a null 1:1 value (binding, runtime...) removes it.
 */
export const writeModulo = async (
  db: PrismaDb,
  id: string,
  modulo: ModuloUpdateValues,
  mode: WriteMode<ModuloKey>,
) => {
  const has = presentIn(modulo, mode);
  const where = { moduloId: id };
  const data = moduloColumns(modulo, has);
  if (mode.create) {
    await db.modulo.create({ data: { id, ...data } as Prisma.ModuloUncheckedCreateInput });
  } else if (Object.keys(data).length > 0) {
    await db.modulo.update({ where: { id }, data });
  }

  if (has("submodulos")) {
    await db.submodulo.deleteMany({ where });
    const rows = submoduloRows(modulo.submodulos ?? []);
    if (rows.length) await db.submodulo.createMany({ data: rows.map((row) => ({ moduloId: id, ...row })) });
  }
  if (has("remoteSupport")) {
    await writeOneToOne(
      modulo.remoteSupport,
      (support) => {
        const columns = remoteSupportColumns(support);
        return db.moduloRemoteSupport.upsert({ where, create: { moduloId: id, ...columns }, update: columns });
      },
      () => db.moduloRemoteSupport.deleteMany({ where }),
    );
  }
  if (has("deviceBinding")) {
    await writeOneToOne(
      modulo.deviceBinding,
      (binding) => {
        const columns = bindingColumns(binding);
        return db.moduloDeviceBinding.upsert({ where, create: { moduloId: id, ...columns }, update: columns });
      },
      () => db.moduloDeviceBinding.deleteMany({ where }),
    );
  }
  if (has("deviceBindingRequests")) {
    await db.moduloDeviceBindingRequest.deleteMany({ where });
    const rows = (modulo.deviceBindingRequests ?? []).map(bindingRequestRow);
    if (rows.length) {
      await db.moduloDeviceBindingRequest.createMany({ data: rows.map((row) => ({ moduloId: id, ...row })) });
    }
  }
  if (has("deviceConnectionAudit")) {
    await writeOneToOne(
      modulo.deviceConnectionAudit,
      (audit) => {
        const columns = connectionAuditColumns(audit);
        return db.moduloConnectionAudit.upsert({ where, create: { moduloId: id, ...columns }, update: columns });
      },
      () => db.moduloConnectionAudit.deleteMany({ where }),
    );
  }
  if (has("deviceRuntime")) {
    await writeOneToOne(
      modulo.deviceRuntime,
      (runtime) => {
        const columns = runtimeColumns(runtime);
        return db.moduloDeviceRuntime.upsert({ where, create: { moduloId: id, ...columns }, update: columns });
      },
      () => db.moduloDeviceRuntime.deleteMany({ where }),
    );
  }
};
