/**
 * Parking rate of a project, configured in OPERATIVO (it charges offline). Each change is a new
 * version; tickets record the version they were quoted with.
 *
 * How a stay is charged:
 * 1. Up to `toleranceMinutes` (inclusive) it is free.
 * 2. Otherwise the first block (`firstBlockMinutes`) costs `firstBlockPrice`, and every started
 *    fraction of `fractionMinutes` after it costs `fractionPrice` (2 minutes into a fraction
 *    pay the whole fraction).
 * 3. With `dailyMax`, each full 24 h costs at most that much; the time after the last full day
 *    keeps counting fractions (no new first block or tolerance), also capped at `dailyMax`.
 */
export interface ParkingRateRules {
  toleranceMinutes: number;
  firstBlockMinutes: number;
  firstBlockPrice: number;
  fractionMinutes: number;
  fractionPrice: number;
  /** null: no daily cap. */
  dailyMax: number | null;
}

export interface ParkingRate extends ParkingRateRules {
  id: string;
  proyectoId: string;
  version: number;
  createdAt: number;
  /** User who saved this version (empty for system changes). */
  createdBy: string;
}

export interface FeeLine {
  concept: string;
  amount: number;
}

export interface ParkingFee {
  amount: number;
  /** How the amount was reached, in words for the cashier and the configuration screen. */
  lines: FeeLine[];
}

const DAY_MINUTES = 24 * 60;
const MAX_PRICE = 100_000;

const cents = (pesos: number) => Math.round(pesos * 100);
const pesos = (value: number) => value / 100;
const money = (value: number) => `$${pesos(value).toFixed(2)}`;
const fractions = (count: number, minutes: number) => `${count} ${count === 1 ? "fraccion" : "fracciones"} de ${minutes} min`;

/** Rules before any rate is configured: under an hour $10, otherwise $20 (what OPERATIVO always charged). */
export const legacyParkingFee = (minutes: number): ParkingFee => {
  const amount = minutes < 60 ? 10 : 20;
  return { amount, lines: [{ concept: minutes < 60 ? "Tarifa base: menos de 1 hora" : "Tarifa base: 1 hora o mas", amount }] };
};

/** Problem with a rate, in Spanish, or null. */
export const validateParkingRate = (rules: ParkingRateRules): string | null => {
  const minutes = (value: number, min: number) => Number.isInteger(value) && value >= min && value <= DAY_MINUTES;
  const price = (value: number) => Number.isFinite(value) && value >= 0 && value <= MAX_PRICE && Math.abs(cents(value) - value * 100) < 1e-6;
  if (!minutes(rules.toleranceMinutes, 0)) return "La tolerancia debe ser de 0 a 1440 minutos";
  if (!minutes(rules.firstBlockMinutes, 1)) return "El primer bloque debe ser de 1 a 1440 minutos";
  if (!minutes(rules.fractionMinutes, 1)) return "La fraccion debe ser de 1 a 1440 minutos";
  if (rules.toleranceMinutes >= rules.firstBlockMinutes) return "La tolerancia debe ser menor que el primer bloque";
  if (!price(rules.firstBlockPrice) || !price(rules.fractionPrice)) return "Los precios deben ser de $0 a $100,000 con hasta 2 decimales";
  if (rules.firstBlockPrice <= 0) return "El primer bloque debe costar mas de $0";
  if (rules.dailyMax !== null) {
    if (!price(rules.dailyMax)) return "El tope diario debe ser de $0 a $100,000 con hasta 2 decimales";
    if (rules.dailyMax < rules.firstBlockPrice) return "El tope diario no puede ser menor que el primer bloque";
  }
  return null;
};

/** Amount for a stay of `minutes` (whole minutes, as stored on the ticket). */
export const calculateParkingFee = (rules: ParkingRateRules, minutes: number): ParkingFee => {
  const stay = Math.max(0, Math.floor(minutes));
  if (stay <= rules.toleranceMinutes) {
    return { amount: 0, lines: [{ concept: `Dentro de la tolerancia (${rules.toleranceMinutes} min)`, amount: 0 }] };
  }
  const cap = rules.dailyMax === null ? null : cents(rules.dailyMax);
  const first = cents(rules.firstBlockPrice);
  const fraction = cents(rules.fractionPrice);
  const lines: Array<{ concept: string; cents: number }> = [];

  // Without a cap the stay is one long count, whatever its length.
  const days = cap === null ? 0 : Math.floor(stay / DAY_MINUTES);
  const rest = cap === null ? stay : stay % DAY_MINUTES;

  if (days > 0) {
    const fullDay = first + Math.ceil((DAY_MINUTES - rules.firstBlockMinutes) / rules.fractionMinutes) * fraction;
    const perDay = Math.min(fullDay, cap!);
    lines.push({ concept: `${days} ${days === 1 ? "dia completo" : "dias completos"}${perDay === cap ? ` (tope ${money(cap!)})` : ""}`, cents: days * perDay });
    if (rest > 0) {
      const count = Math.ceil(rest / rules.fractionMinutes);
      const extra = count * fraction;
      lines.push({ concept: `${fractions(count, rules.fractionMinutes)} adicionales${extra > cap! ? ` (tope ${money(cap!)})` : ""}`, cents: Math.min(extra, cap!) });
    }
  } else {
    lines.push({ concept: `Primer bloque (${rules.firstBlockMinutes} min)`, cents: first });
    if (rest > rules.firstBlockMinutes) {
      const count = Math.ceil((rest - rules.firstBlockMinutes) / rules.fractionMinutes);
      lines.push({ concept: fractions(count, rules.fractionMinutes), cents: count * fraction });
    }
    const subtotal = lines.reduce((sum, line) => sum + line.cents, 0);
    if (cap !== null && subtotal > cap) lines.push({ concept: `Tope diario (${money(cap)})`, cents: cap - subtotal });
  }

  const total = lines.reduce((sum, line) => sum + line.cents, 0);
  return { amount: pesos(total), lines: lines.map((line) => ({ concept: line.concept, amount: pesos(line.cents) })) };
};
