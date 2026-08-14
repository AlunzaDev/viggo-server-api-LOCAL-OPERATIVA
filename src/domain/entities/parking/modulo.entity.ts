import { CustomError } from "../../errors/custom.error";
import {
    parseRemoteSupportProvider,
    RemoteSupportProvider,
} from "./remote-support.entity";
import { ModuloTipo, parseModuloTipo } from "./module-type.entity";
import {
    getModuloTypeCapabilities,
    ModuloTypeCapabilities,
} from "./module-type-capabilities.entity";

export const MODULO_SUBMODULO_TIPOS = [
    "QR_SCANNER",
    "PRINTER",
    "BARRIER",
    "CAMERA",
    "CASH_DRAWER",
    "CASH_ACCEPTOR",
    "DISPLAY",
    "KEYPAD",
    "OTHER",
] as const;

export type ModuloSubmoduloTipo = (typeof MODULO_SUBMODULO_TIPOS)[number];

export interface ModuloSubmodulo {
    submoduloId: string;
    nombre: string;
    tipo: ModuloSubmoduloTipo;
    identificador?: string;
    ip?: string;
    mac?: string;
    ubicacion?: string;
    coordinates?: [number, number];
    descripcion?: string;
    estado: boolean;
}

export interface ModuloDeviceBinding {
    fingerprint: string;
    cpuSerial?: string;
    machineId?: string;
    primaryMac?: string;
    deviceSecretHash?: string;
    deviceSecretIssuedAt?: Date;
    boundAt: Date;
    lastSeenAt: Date;
}

export type ModuloDeviceBindingRequestStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED";

export interface ModuloDeviceBindingRequest {
    fingerprint: string;
    cpuSerial?: string;
    machineId?: string;
    primaryMac?: string;
    ipAddress?: string;
    locationLabel?: string;
    status: ModuloDeviceBindingRequestStatus;
    requestedAt: Date;
    resolvedAt?: Date;
    notes?: string;
}

export type ModuloDeviceConnectionAuditStatus =
    | "APPROVED"
    | "PENDING"
    | "REJECTED";

export type ModuloDeviceRuntimeConnectionStatus =
    | "CONNECTED"
    | "DISCONNECTED"
    | "PENDING"
    | "REJECTED"
    | "MISMATCH";

export interface ModuloDeviceConnectionAudit {
    fingerprint?: string;
    cpuSerial?: string;
    machineId?: string;
    primaryMac?: string;
    ipAddress?: string;
    locationLabel?: string;
    socketId?: string;
    status: ModuloDeviceConnectionAuditStatus;
    reason?: string;
    attemptedAt: Date;
}

export interface ModuloDeviceRuntime {
    fingerprint?: string;
    socketId?: string;
    ipAddress?: string;
    locationLabel?: string;
    connectionStatus: ModuloDeviceRuntimeConnectionStatus;
    isConnected: boolean;
    isAuthorized: boolean;
    connectedAt?: Date;
    lastHeartbeatAt?: Date;
    lastDisconnectAt?: Date;
    message?: string;
}

export type ModuloRemoteSupportProvider = RemoteSupportProvider;

export interface ModuloRemoteSupport {
    provider: ModuloRemoteSupportProvider;
    enabled: boolean;
    deviceName?: string;
    deviceId?: string;
    groupId?: string;
    baseUrl?: string;
    supportUrl?: string;
    desktopUrl?: string;
    terminalUrl?: string;
    linkedAt?: Date;
    updatedAt?: Date;
}

export interface ModuloEntityOptions {
    id: string;
    nombre: string;
    proyecto: string;
    tipo: ModuloTipo;
    estado: boolean;
    identificador: string;
    ip?: string;
    mac?: string;
    ubicacion?: string;
    coordinates?: [number, number];
    descripcion?: string;
    deviceBinding?: ModuloDeviceBinding | null;
    deviceBindingRequests?: ModuloDeviceBindingRequest[];
    deviceConnectionAudit?: ModuloDeviceConnectionAudit | null;
    deviceRuntime?: ModuloDeviceRuntime | null;
    remoteSupport?: ModuloRemoteSupport | null;
    submodulos?: ModuloSubmodulo[];
}

export type ModuloCreateValues = Omit<ModuloEntityOptions, "id">;

export type ModuloUpdateValues = Partial<ModuloCreateValues>;

export class ModuloEntity {
    public id: string;
    public nombre: string;
    public proyecto: string;
    public tipo: ModuloTipo;
    public estado: boolean;
    public identificador: string;
    public ip?: string;
    public mac?: string;
    public ubicacion?: string;
    public coordinates?: [number, number];
    public descripcion?: string;
    public deviceBinding?: ModuloDeviceBinding | null;
    public deviceBindingRequests: ModuloDeviceBindingRequest[];
    public deviceConnectionAudit?: ModuloDeviceConnectionAudit | null;
    public deviceRuntime?: ModuloDeviceRuntime | null;
    public remoteSupport?: ModuloRemoteSupport | null;
    public submodulos: ModuloSubmodulo[];

    constructor(options: ModuloEntityOptions) {
        const {
            id,
            nombre,
            proyecto,
            tipo,
            estado,
            identificador,
            ip,
            mac,
            ubicacion,
            coordinates,
            descripcion,
            deviceBinding,
            deviceBindingRequests,
            deviceConnectionAudit,
            deviceRuntime,
            remoteSupport,
            submodulos,
        } = options;

        this.id = id;
        this.nombre = nombre;
        this.proyecto = proyecto;
        this.tipo = tipo;
        this.estado = estado;
        this.identificador = identificador;
        this.ip = ip;
        this.mac = mac;
        this.ubicacion = ubicacion;
        this.coordinates = coordinates;
        this.descripcion = descripcion;
        this.deviceBinding = deviceBinding ?? null;
        this.deviceBindingRequests = deviceBindingRequests ?? [];
        this.deviceConnectionAudit = deviceConnectionAudit ?? null;
        this.deviceRuntime = deviceRuntime ?? null;
        this.remoteSupport = remoteSupport ?? null;
        this.submodulos = submodulos ?? [];
    }

    get capabilities(): ModuloTypeCapabilities {
        return getModuloTypeCapabilities(this.tipo);
    }

    get requiresDeviceBinding(): boolean {
        return this.capabilities.requiresDeviceBinding;
    }

    get supportsRemoteSupport(): boolean {
        return this.capabilities.supportsRemoteSupport;
    }

    static fromObject(object: { [key: string]: unknown }): ModuloEntity {
        const {
            _id,
            id,
            nombre,
            proyecto,
            tipo,
            estado,
            identificador,
            ip,
            mac,
            ubicacion,
            coordinates,
            descripcion,
            deviceBinding,
            deviceBindingRequests,
            deviceConnectionAudit,
            deviceRuntime,
            remoteSupport,
            submodulos,
        } = object;

        const moduloId = id || (_id ? String(_id) : undefined);
        const parsedTipo = parseModuloTipo(tipo);

        if (!moduloId) throw CustomError.badRequest("Missing id");
        if (!nombre) throw CustomError.badRequest("Missing nombre");
        if (!proyecto) throw CustomError.badRequest("Missing proyecto");
        if (!parsedTipo) throw CustomError.badRequest("Invalid tipo");
        if (estado === undefined || estado === null) {
            throw CustomError.badRequest("Missing estado");
        }
        if (!identificador) throw CustomError.badRequest("Missing identificador");

        return new ModuloEntity({
            id: String(moduloId),
            nombre: String(nombre).trim(),
            proyecto: String(proyecto),
            tipo: parsedTipo,
            estado: Boolean(estado),
            identificador: String(identificador).trim(),
            ip: typeof ip === "string" ? ip.trim() || undefined : undefined,
            mac: typeof mac === "string" ? mac.trim() || undefined : undefined,
            ubicacion:
                typeof ubicacion === "string" ? ubicacion.trim() || undefined : undefined,
            coordinates: parseCoordinates(coordinates),
            descripcion: typeof descripcion === "string" ? descripcion : undefined,
            deviceBinding: parseDeviceBinding(deviceBinding),
            deviceBindingRequests: parseDeviceBindingRequests(deviceBindingRequests),
            deviceConnectionAudit: parseDeviceConnectionAudit(deviceConnectionAudit),
            deviceRuntime: parseDeviceRuntime(deviceRuntime),
            remoteSupport: parseRemoteSupport(remoteSupport),
            submodulos: parseSubmodulos(submodulos),
        });
    }
}

function parseSubmodulos(value: unknown): ModuloSubmodulo[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => parseSubmodulo(item))
        .filter((item): item is ModuloSubmodulo => Boolean(item));
}

function parseSubmodulo(value: unknown): ModuloSubmodulo | null {
    if (!value || typeof value !== "object") return null;

    const source = value as Record<string, unknown>;
    const submoduloId = String(source.submoduloId ?? source.id ?? source._id ?? "").trim();
    const nombre = String(source.nombre ?? source.name ?? "").trim();
    const tipo = String(source.tipo ?? source.type ?? "OTHER").trim().toUpperCase();

    if (!submoduloId || !nombre) return null;

    return {
        submoduloId,
        nombre,
        tipo: MODULO_SUBMODULO_TIPOS.includes(tipo as ModuloSubmoduloTipo)
            ? (tipo as ModuloSubmoduloTipo)
            : "OTHER",
        identificador: String(source.identificador ?? "").trim() || undefined,
        ip: String(source.ip ?? "").trim() || undefined,
        mac: String(source.mac ?? "").trim() || undefined,
        ubicacion: String(source.ubicacion ?? "").trim() || undefined,
        coordinates: parseCoordinates(source.coordinates),
        descripcion: String(source.descripcion ?? "").trim() || undefined,
        estado: source.estado === undefined ? true : Boolean(source.estado),
    };
}

function parseCoordinates(value: unknown): [number, number] | undefined {
    if (!Array.isArray(value) || value.length !== 2) return undefined;

    const longitude = Number(value[0]);
    const latitude = Number(value[1]);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return undefined;
    }

    return [longitude, latitude];
}

function parseDeviceBinding(value: unknown): ModuloDeviceBinding | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const binding = value as Record<string, unknown>;
    const fingerprint = String(binding.fingerprint ?? "").trim();

    if (!fingerprint) {
        return null;
    }

    return {
        fingerprint,
        cpuSerial: String(binding.cpuSerial ?? "").trim() || undefined,
        machineId: String(binding.machineId ?? "").trim() || undefined,
        primaryMac: String(binding.primaryMac ?? "").trim() || undefined,
        deviceSecretHash: String(binding.deviceSecretHash ?? "").trim() || undefined,
        deviceSecretIssuedAt:
            binding.deviceSecretIssuedAt === undefined ||
            binding.deviceSecretIssuedAt === null
                ? undefined
                : toDate(
                      binding.deviceSecretIssuedAt,
                      "deviceBinding.deviceSecretIssuedAt",
                  ),
        boundAt: toDate(binding.boundAt, "deviceBinding.boundAt"),
        lastSeenAt: toDate(binding.lastSeenAt, "deviceBinding.lastSeenAt"),
    };
}

function toDate(value: unknown, fieldName: string): Date {
    const date =
        value instanceof Date
            ? value
            : typeof value === "number"
              ? new Date(value)
              : new Date(String(value ?? ""));

    if (Number.isNaN(date.getTime())) {
        throw CustomError.badRequest(`Invalid ${fieldName}`);
    }

    return date;
}

function parseDeviceBindingRequests(
    value: unknown,
): ModuloDeviceBindingRequest[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => parseDeviceBindingRequest(item))
        .filter((item): item is ModuloDeviceBindingRequest => item !== null);
}

function parseDeviceBindingRequest(
    value: unknown,
): ModuloDeviceBindingRequest | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const request = value as Record<string, unknown>;
    const fingerprint = String(request.fingerprint ?? "").trim();
    const status = String(request.status ?? "").trim().toUpperCase();

    if (!fingerprint || !isValidRequestStatus(status)) {
        return null;
    }

    const resolvedAtValue = request.resolvedAt;

    return {
        fingerprint,
        cpuSerial: String(request.cpuSerial ?? "").trim() || undefined,
        machineId: String(request.machineId ?? "").trim() || undefined,
        primaryMac: String(request.primaryMac ?? "").trim() || undefined,
        ipAddress: String(request.ipAddress ?? "").trim() || undefined,
        locationLabel: String(request.locationLabel ?? "").trim() || undefined,
        status,
        requestedAt: toDate(request.requestedAt, "deviceBindingRequests.requestedAt"),
        resolvedAt:
            resolvedAtValue === undefined || resolvedAtValue === null
                ? undefined
                : toDate(resolvedAtValue, "deviceBindingRequests.resolvedAt"),
        notes: String(request.notes ?? "").trim() || undefined,
    };
}

function isValidRequestStatus(
    value: string,
): value is ModuloDeviceBindingRequestStatus {
    return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}

function parseDeviceConnectionAudit(
    value: unknown,
): ModuloDeviceConnectionAudit | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const audit = value as Record<string, unknown>;
    const status = String(audit.status ?? "").trim().toUpperCase();

    if (!isValidConnectionAuditStatus(status)) {
        return null;
    }

    return {
        fingerprint: String(audit.fingerprint ?? "").trim() || undefined,
        cpuSerial: String(audit.cpuSerial ?? "").trim() || undefined,
        machineId: String(audit.machineId ?? "").trim() || undefined,
        primaryMac: String(audit.primaryMac ?? "").trim() || undefined,
        ipAddress: String(audit.ipAddress ?? "").trim() || undefined,
        locationLabel: String(audit.locationLabel ?? "").trim() || undefined,
        socketId: String(audit.socketId ?? "").trim() || undefined,
        status,
        reason: String(audit.reason ?? "").trim() || undefined,
        attemptedAt: toDate(audit.attemptedAt, "deviceConnectionAudit.attemptedAt"),
    };
}

function parseDeviceRuntime(value: unknown): ModuloDeviceRuntime | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const runtime = value as Record<string, unknown>;
    const connectionStatus = String(runtime.connectionStatus ?? "")
        .trim()
        .toUpperCase();

    if (!isValidRuntimeConnectionStatus(connectionStatus)) {
        return null;
    }

    return {
        fingerprint: String(runtime.fingerprint ?? "").trim() || undefined,
        socketId: String(runtime.socketId ?? "").trim() || undefined,
        ipAddress: String(runtime.ipAddress ?? "").trim() || undefined,
        locationLabel: String(runtime.locationLabel ?? "").trim() || undefined,
        connectionStatus,
        isConnected: Boolean(runtime.isConnected),
        isAuthorized: Boolean(runtime.isAuthorized),
        connectedAt:
            runtime.connectedAt === undefined || runtime.connectedAt === null
                ? undefined
                : toDate(runtime.connectedAt, "deviceRuntime.connectedAt"),
        lastHeartbeatAt:
            runtime.lastHeartbeatAt === undefined || runtime.lastHeartbeatAt === null
                ? undefined
                : toDate(
                      runtime.lastHeartbeatAt,
                      "deviceRuntime.lastHeartbeatAt",
                  ),
        lastDisconnectAt:
            runtime.lastDisconnectAt === undefined || runtime.lastDisconnectAt === null
                ? undefined
                : toDate(
                      runtime.lastDisconnectAt,
                      "deviceRuntime.lastDisconnectAt",
                  ),
        message: String(runtime.message ?? "").trim() || undefined,
    };
}

function parseRemoteSupport(value: unknown): ModuloRemoteSupport | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const support = value as Record<string, unknown>;
    const provider = parseRemoteSupportProvider(support.provider);
    if (!provider) {
        return null;
    }

    return {
        provider,
        enabled: Boolean(support.enabled),
        deviceName: String(support.deviceName ?? "").trim() || undefined,
        deviceId: String(support.deviceId ?? "").trim() || undefined,
        groupId: String(support.groupId ?? "").trim() || undefined,
        baseUrl: String(support.baseUrl ?? "").trim() || undefined,
        supportUrl: String(support.supportUrl ?? "").trim() || undefined,
        desktopUrl: String(support.desktopUrl ?? "").trim() || undefined,
        terminalUrl: String(support.terminalUrl ?? "").trim() || undefined,
        linkedAt:
            support.linkedAt === undefined || support.linkedAt === null
                ? undefined
                : toDate(support.linkedAt, "remoteSupport.linkedAt"),
        updatedAt:
            support.updatedAt === undefined || support.updatedAt === null
                ? undefined
                : toDate(support.updatedAt, "remoteSupport.updatedAt"),
    };
}

function isValidConnectionAuditStatus(
    value: string,
): value is ModuloDeviceConnectionAuditStatus {
    return value === "APPROVED" || value === "PENDING" || value === "REJECTED";
}

function isValidRuntimeConnectionStatus(
    value: string,
): value is ModuloDeviceRuntimeConnectionStatus {
    return (
        value === "CONNECTED" ||
        value === "DISCONNECTED" ||
        value === "PENDING" ||
        value === "REJECTED" ||
        value === "MISMATCH"
    );
}

/** FINGER PRINT GENERATION
cpu_serial = _read_cpu_serial()
machine_id = _read_machine_id()
primary_mac = _read_primary_mac()

raw_identity = f"{cpu_serial}|{machine_id}|{primary_mac}"
fingerprint = hashlib.sha256(raw_identity.encode("utf-8")).hexdigest()
 */
