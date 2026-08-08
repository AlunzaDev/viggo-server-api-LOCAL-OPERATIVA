import { Schema, model } from "mongoose";

const schema = new Schema({
  operationId: { type: String, required: true, unique: true, trim: true },
  type: { type: String, required: true, trim: true },
  result: { type: Schema.Types.Mixed, required: true },
  processedAt: { type: Number, required: true, index: true },
}, { versionKey: false });

export const MobileCommandReceiptModel = model("MobileCommandReceipt", schema);
