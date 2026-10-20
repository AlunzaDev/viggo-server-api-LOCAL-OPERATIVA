import {
  calculateParkingFee,
  legacyParkingFee,
  validateParkingRate,
  type ParkingRate,
  type ParkingRateRules,
} from "../../../domain/entities/parking/parking-rate.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { ParkingRateRepository } from "../../../domain/repositories/parking/parking-rate.repository";

const MAX_SIMULATED_MINUTES = 60 * 24 * 60;

const money = (value: number) => `$${value.toFixed(2)}`;
const duration = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? "hora" : "horas"}` : `${minutes} min`;

/** The rate in plain words: "15 min gratis, primera hora $20.00, cada 15 min $5.00, maximo $150.00 por dia". */
export const describeParkingRate = (rules: ParkingRateRules) => [
  rules.toleranceMinutes > 0 ? `${rules.toleranceMinutes} min gratis` : "sin tolerancia",
  `${rules.firstBlockMinutes === 60 ? "primera hora" : `primeros ${duration(rules.firstBlockMinutes)}`} ${money(rules.firstBlockPrice)}`,
  `cada ${duration(rules.fractionMinutes)} adicional ${money(rules.fractionPrice)}`,
  rules.dailyMax === null ? "sin tope diario" : `maximo ${money(rules.dailyMax)} por dia`,
].join(", ");

const LEGACY_DESCRIPTION = "Tarifa base: menos de 1 hora $10.00, 1 hora o mas $20.00";

/** Reads a rate from a request body; JSON numbers, or text from a form. */
export const parseParkingRateRules = (body: Record<string, unknown>): ParkingRateRules => {
  const number = (value: unknown, field: string) => {
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) throw CustomError.badRequest(`'${field}' debe ser un numero`);
    return parsed;
  };
  const rules: ParkingRateRules = {
    toleranceMinutes: number(body.toleranceMinutes, "toleranceMinutes"),
    firstBlockMinutes: number(body.firstBlockMinutes, "firstBlockMinutes"),
    firstBlockPrice: number(body.firstBlockPrice, "firstBlockPrice"),
    fractionMinutes: number(body.fractionMinutes, "fractionMinutes"),
    fractionPrice: number(body.fractionPrice, "fractionPrice"),
    // Empty or null: no daily cap.
    dailyMax: body.dailyMax === null || body.dailyMax === undefined || body.dailyMax === "" ? null : number(body.dailyMax, "dailyMax"),
  };
  const problem = validateParkingRate(rules);
  if (problem) throw CustomError.badRequest(problem);
  return rules;
};

export class ParkingRateService {
  constructor(private readonly rates: ParkingRateRepository) {}

  async getCurrent(proyectoId: string) {
    const rate = await this.rates.findCurrent(proyectoId);
    return { tarifa: rate, configurada: Boolean(rate), descripcion: rate ? describeParkingRate(rate) : LEGACY_DESCRIPTION };
  }

  async save(proyectoId: string, body: Record<string, unknown>, userId: string) {
    const rate = await this.rates.createVersion(proyectoId, parseParkingRateRules(body), userId);
    return { tarifa: rate, configurada: true, descripcion: describeParkingRate(rate) };
  }

  async history(proyectoId: string): Promise<Array<ParkingRate & { descripcion: string }>> {
    return (await this.rates.getHistory(proyectoId, 50)).map((rate) => ({ ...rate, descripcion: describeParkingRate(rate) }));
  }

  /**
   * What a stay of `minutes` would cost: with `rules` (a draft not saved yet, for the form's
   * calculator) or with the current rate.
   */
  async simulate(proyectoId: string, body: Record<string, unknown>) {
    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_SIMULATED_MINUTES) {
      throw CustomError.badRequest("'minutes' debe ser un entero de 0 a 86400 (60 dias)");
    }
    if (body.rules !== undefined) {
      if (!body.rules || typeof body.rules !== "object" || Array.isArray(body.rules)) throw CustomError.badRequest("'rules' debe ser un objeto");
      return { minutes, ...calculateParkingFee(parseParkingRateRules(body.rules as Record<string, unknown>), minutes) };
    }
    const rate = await this.rates.findCurrent(proyectoId);
    return { minutes, ...(rate ? calculateParkingFee(rate, minutes) : legacyParkingFee(minutes)) };
  }
}
