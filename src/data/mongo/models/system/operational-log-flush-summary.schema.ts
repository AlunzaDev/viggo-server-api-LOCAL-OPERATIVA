import { Schema, model } from "mongoose";

const operationalLogFlushSummarySchema = new Schema(
  {
    monthKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    flushType: {
      type: String,
      enum: ["monthly", "partial"],
      required: true,
      index: true,
    },
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
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
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
    source: {
      type: String,
      enum: ["backend", "device", "app", "sync", "system"],
      required: true,
      index: true,
    },
    totalLogs: {
      type: Number,
      required: true,
      default: 0,
    },
    firstCreatedAt: {
      type: Number,
      required: true,
    },
    lastCreatedAt: {
      type: Number,
      required: true,
    },
    sampleMessage: {
      type: String,
      required: false,
      default: "",
      trim: true,
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

operationalLogFlushSummarySchema.index(
  {
    monthKey: 1,
    dayKey: 1,
    flushType: 1,
    kind: 1,
    scope: 1,
    severity: 1,
    type: 1,
    installationId: 1,
    projectId: 1,
    moduloId: 1,
    source: 1,
  },
  { unique: true, name: "operational_log_flush_summary_unique" },
);

export const OperationalLogFlushSummaryModel = model(
  "OperationalLogFlushSummary",
  operationalLogFlushSummarySchema,
);
