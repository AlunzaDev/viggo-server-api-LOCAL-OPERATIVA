import { Schema, model } from "mongoose";

const monthlyFlushConfigSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    partialCurrentMonthEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    closeDay: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 1,
    },
    partialDays: {
      type: [Number],
      required: true,
      default: [],
    },
    hour: {
      type: Number,
      required: true,
      default: 2,
      min: 0,
      max: 23,
    },
    minute: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 59,
    },
    lastAutomaticRunAt: {
      type: Number,
      required: false,
      default: null,
    },
    updatedAt: {
      type: Number,
      required: true,
      default: Date.now,
    },
    updatedByUserId: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    updatedByUserName: {
      type: String,
      required: false,
      default: "",
      trim: true,
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

export const MonthlyFlushConfigModel = model(
  "MonthlyFlushConfig",
  monthlyFlushConfigSchema,
);
