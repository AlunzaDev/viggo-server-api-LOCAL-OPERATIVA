import { Schema, model } from "mongoose";

const localInstallationSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    installationId: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },
    proyectoId: {
      type: String,
      default: "",
      trim: true,
    },
    proyectoNombre: {
      type: String,
      default: "",
      trim: true,
    },
    proyectoIdentificador: {
      type: String,
      default: "",
      trim: true,
    },
    source: {
      type: String,
      enum: ["env", "manual", "cloudApproval"],
      default: "manual",
    },
    status: {
      type: String,
      enum: ["pending", "requested", "approved", "rejected", "linked"],
      default: "pending",
    },
    cloudRequestId: {
      type: String,
      default: "",
      trim: true,
    },
    encryptedSyncToken: {
      type: String,
      default: "",
      trim: true,
    },
    syncTokenIssuedAt: {
      type: Number,
      default: undefined,
    },
    syncTokenRotatedAt: {
      type: Number,
      default: undefined,
    },
    reviewNote: {
      type: String,
      default: "",
      trim: true,
    },
    requestedAt: {
      type: Number,
      default: undefined,
    },
    reviewedAt: {
      type: Number,
      default: undefined,
    },
    assignedByUserId: {
      type: String,
      default: "",
      trim: true,
    },
    assignedAt: {
      type: Number,
      default: undefined,
    },
    updatedAt: {
      type: Number,
      required: true,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

export const LocalInstallationModel = model(
  "LocalInstallation",
  localInstallationSchema,
);
