import { Schema, model } from "mongoose";
import {
    DEFAULT_REMOTE_SUPPORT_PROVIDER,
    REMOTE_SUPPORT_PROVIDERS,
} from "../../../../domain/entities/parking/remote-support.entity";
import { MODULO_TIPOS } from "../../../../domain/entities/parking/module-type.entity";

const deviceBindingSchema = new Schema(
    {
        fingerprint: {
            type: String,
            required: [true, "El fingerprint es obligatorio"],
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        deviceSecretHash: {
            type: String,
            default: "",
            trim: true,
        },
        deviceSecretIssuedAt: {
            type: Date,
            default: null,
        },
        boundAt: {
            type: Date,
            required: [true, "La fecha de vinculacion es obligatoria"],
        },
        lastSeenAt: {
            type: Date,
            required: [true, "La fecha de ultima conexion es obligatoria"],
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const deviceBindingRequestSchema = new Schema(
    {
        fingerprint: {
            type: String,
            required: [true, "El fingerprint es obligatorio"],
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        ipAddress: {
            type: String,
            default: "",
            trim: true,
        },
        locationLabel: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            required: [true, "El status es obligatorio"],
        },
        requestedAt: {
            type: Number,
            required: [true, "La fecha de solicitud es obligatoria"],
        },
        resolvedAt: {
            type: Number,
            default: null,
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const deviceConnectionAuditSchema = new Schema(
    {
        fingerprint: {
            type: String,
            default: "",
            trim: true,
        },
        cpuSerial: {
            type: String,
            default: "",
            trim: true,
        },
        machineId: {
            type: String,
            default: "",
            trim: true,
        },
        primaryMac: {
            type: String,
            default: "",
            trim: true,
        },
        ipAddress: {
            type: String,
            default: "",
            trim: true,
        },
        locationLabel: {
            type: String,
            default: "",
            trim: true,
        },
        socketId: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: ["APPROVED", "PENDING", "REJECTED"],
            default: "PENDING",
        },
        reason: {
            type: String,
            default: "",
            trim: true,
        },
        attemptedAt: {
            type: Number,
            default: null,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const deviceRuntimeSchema = new Schema(
    {
        fingerprint: {
            type: String,
            default: "",
            trim: true,
        },
        socketId: {
            type: String,
            default: "",
            trim: true,
        },
        ipAddress: {
            type: String,
            default: "",
            trim: true,
        },
        locationLabel: {
            type: String,
            default: "",
            trim: true,
        },
        connectionStatus: {
            type: String,
            enum: ["CONNECTED", "DISCONNECTED", "PENDING", "REJECTED", "MISMATCH"],
            default: "DISCONNECTED",
        },
        isConnected: {
            type: Boolean,
            default: false,
        },
        isAuthorized: {
            type: Boolean,
            default: false,
        },
        connectedAt: {
            type: Date,
            default: null,
        },
        lastHeartbeatAt: {
            type: Date,
            default: null,
        },
        lastDisconnectAt: {
            type: Date,
            default: null,
        },
        message: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const moduloSubmoduloSchema = new Schema(
    {
        submoduloId: {
            type: String,
            required: false,
            trim: true,
        },
        nombre: {
            type: String,
            required: [true, "El nombre del submodulo es obligatorio"],
            trim: true,
        },
        tipo: {
            type: String,
            required: [true, "El tipo del submodulo es obligatorio"],
            enum: [
                "QR_SCANNER",
                "PRINTER",
                "BARRIER",
                "CAMERA",
                "CASH_DRAWER",
                "CASH_ACCEPTOR",
                "DISPLAY",
                "KEYPAD",
                "OTHER",
            ],
            default: "OTHER",
        },
        identificador: {
            type: String,
            default: "",
            trim: true,
        },
        ip: {
            type: String,
            default: "",
            trim: true,
        },
        mac: {
            type: String,
            default: "",
            trim: true,
        },
        ubicacion: {
            type: String,
            default: "",
            trim: true,
        },
        coordinates: {
            type: [Number],
            default: [],
            validate: {
                validator: (value: unknown) =>
                    !Array.isArray(value) ||
                    value.length === 0 ||
                    (value.length === 2 &&
                        Number.isFinite(Number(value[0])) &&
                        Number.isFinite(Number(value[1]))),
                message: "coordinates debe contener [lon,lat]",
            },
        },
        descripcion: {
            type: String,
            default: "",
            trim: true,
        },
        estado: {
            type: Boolean,
            default: true,
        },
    },
    {
        versionKey: false,
    },
);

const remoteSupportSchema = new Schema(
    {
        provider: {
            type: String,
            enum: REMOTE_SUPPORT_PROVIDERS,
            default: DEFAULT_REMOTE_SUPPORT_PROVIDER,
        },
        enabled: {
            type: Boolean,
            default: false,
        },
        deviceName: {
            type: String,
            default: "",
            trim: true,
        },
        deviceId: {
            type: String,
            default: "",
            trim: true,
        },
        groupId: {
            type: String,
            default: "",
            trim: true,
        },
        baseUrl: {
            type: String,
            default: "",
            trim: true,
        },
        supportUrl: {
            type: String,
            default: "",
            trim: true,
        },
        desktopUrl: {
            type: String,
            default: "",
            trim: true,
        },
        terminalUrl: {
            type: String,
            default: "",
            trim: true,
        },
        linkedAt: {
            type: Date,
            default: null,
        },
        updatedAt: {
            type: Date,
            default: null,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const moduloSchema = new Schema(
    {
        nombre: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        proyecto: {
            type: Schema.Types.ObjectId,
            ref: "Proyecto",
            required: [true, "El proyecto es obligatorio"],
        },
        tipo: {
            type: String,
            required: [true, "El tipo es obligatorio"],
            enum: MODULO_TIPOS,
        },
        estado: {
            type: Boolean,
            default: true,
        },
        identificador: {
            type: String,
            required: [true, "El identificador es obligatorio"],
            trim: true,
        },
        ip: {
            type: String,
            default: "",
            trim: true,
        },
        mac: {
            type: String,
            default: "",
            trim: true,
        },
        ubicacion: {
            type: String,
            default: "",
            trim: true,
        },
        coordinates: {
            type: [Number],
            default: [],
            validate: {
                validator: (value: unknown) =>
                    !Array.isArray(value) ||
                    value.length === 0 ||
                    (value.length === 2 &&
                        Number.isFinite(Number(value[0])) &&
                        Number.isFinite(Number(value[1]))),
                message: "coordinates debe contener [lon,lat]",
            },
        },
        descripcion: {
            type: String,
            required: false,
            default: "",
        },
        deviceBinding: {
            type: deviceBindingSchema,
            required: false,
            default: null,
        },
        deviceBindingRequests: {
            type: [deviceBindingRequestSchema],
            required: false,
            default: [],
        },
        deviceConnectionAudit: {
            type: deviceConnectionAuditSchema,
            required: false,
            default: null,
        },
        deviceRuntime: {
            type: deviceRuntimeSchema,
            required: false,
            default: null,
        },
        remoteSupport: {
            type: remoteSupportSchema,
            required: false,
            default: null,
        },
        submodulos: {
            type: [moduloSubmoduloSchema],
            required: false,
            default: [],
        },
    },
    {
        versionKey: false,
        toJSON: {
            transform: (_doc, ret) => {
                const serialized = ret as Record<string, unknown>;
                serialized.id = String(serialized._id);
                delete serialized._id;
                return serialized;
            },
        },
    },
);

export const ModuloModel = model("Modulo", moduloSchema);

/** FINGEER PRINT GENERATION
cpu_serial = _read_cpu_serial()
machine_id = _read_machine_id()
primary_mac = _read_primary_mac()

raw_identity = f"{cpu_serial}|{machine_id}|{primary_mac}"
fingerprint = hashlib.sha256(raw_identity.encode("utf-8")).hexdigest()
 */
