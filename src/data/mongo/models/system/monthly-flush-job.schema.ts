import { Schema, model } from "mongoose";

const monthlyFlushJobSchema = new Schema(
  {
    monthKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    triggerType: {
      type: String,
      enum: ["manual", "automatic", "partial"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      required: true,
      index: true,
    },
    startedAt: {
      type: Number,
      required: true,
      index: true,
    },
    completedAt: {
      type: Number,
      required: false,
      default: null,
    },
    error: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    requestedByUserId: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    requestedByUserName: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    summary: {
      type: Schema.Types.Mixed,
      required: false,
      default: null,
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

monthlyFlushJobSchema.index({ startedAt: -1 });
monthlyFlushJobSchema.index({ monthKey: 1, triggerType: 1, startedAt: -1 });

export const MonthlyFlushJobModel = model(
  "MonthlyFlushJob",
  monthlyFlushJobSchema,
);
