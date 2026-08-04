import { Schema, model } from "mongoose";

const operationalLogSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["event", "incident"],
      required: true,
      index: true,
    },
    scope: {
      type: String,
      enum: ["access_flow", "device", "payment", "system"],
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
      index: true,
    },
    installationId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    projectId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    projectName: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    moduloId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    moduloNombre: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    submoduloId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    submoduloNombre: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    ticketId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    paymentSessionId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    flowId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["backend", "device", "app", "sync", "system"],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    statusBefore: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    statusAfter: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
    createdAt: {
      type: Number,
      required: true,
      index: true,
    },
    updatedAt: {
      type: Number,
      required: true,
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

operationalLogSchema.index({ createdAt: -1, kind: 1 });
operationalLogSchema.index({ projectId: 1, createdAt: -1 });
operationalLogSchema.index({ moduloId: 1, createdAt: -1 });
operationalLogSchema.index({ ticketId: 1, createdAt: -1 });

export const OperationalLogModel = model("OperationalLog", operationalLogSchema);
