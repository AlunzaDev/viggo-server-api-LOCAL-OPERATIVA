import { Schema, model } from "mongoose";

const configSyncAuditSchema = new Schema(
  {
    installationId: { type: String, required: true, trim: true, index: true },
    proyectoId: { type: String, required: false, default: "", trim: true, index: true },
    proyectoNombre: { type: String, required: false, default: "", trim: true },
    triggeredByUserId: { type: String, required: false, default: "", trim: true },
    triggeredByUserName: { type: String, required: false, default: "", trim: true },
    triggerSource: {
      type: String,
      enum: ["manual", "automatic", "system"],
      default: "manual",
      index: true,
    },
    status: {
      type: String,
      enum: ["success", "success_with_warnings", "failed"],
      required: true,
      index: true,
    },
    startedAt: { type: Number, required: true, index: true },
    finishedAt: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    configurationVersion: { type: Number, required: false, default: null },
    accessVersion: { type: Number, required: false, default: null },
    counts: {
      proyecto: { type: Number, default: 0 },
      modulos: { type: Number, default: 0 },
      pensiones: { type: Number, default: 0 },
      pensionPasses: { type: Number, default: 0 },
      users: { type: Number, default: 0 },
      permissionProfiles: { type: Number, default: 0 },
    },
    errorMessage: { type: String, required: false, default: "", trim: true },
    errorCode: { type: String, required: false, default: "", trim: true },
    metadata: { type: Schema.Types.Mixed, required: false, default: {} },
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

configSyncAuditSchema.index({ startedAt: -1 });

export const ConfigSyncAuditModel = model("ConfigSyncAudit", configSyncAuditSchema);
