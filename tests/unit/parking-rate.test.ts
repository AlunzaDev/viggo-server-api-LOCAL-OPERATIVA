import { describe, expect, it } from "vitest";
import {
  calculateParkingFee,
  legacyParkingFee,
  validateParkingRate,
  type ParkingRateRules,
} from "../../src/domain/entities/parking/parking-rate.entity";

// 15 min free, first hour $20, every 15 min after it $5, at most $150 per day.
const rate: ParkingRateRules = { toleranceMinutes: 15, firstBlockMinutes: 60, firstBlockPrice: 20, fractionMinutes: 15, fractionPrice: 5, dailyMax: 150 };
const amount = (minutes: number, rules = rate) => calculateParkingFee(rules, minutes).amount;
const DAY = 24 * 60;

describe("parking fee", () => {
  it("is free up to the tolerance, inclusive", () => {
    expect(amount(0)).toBe(0);
    expect(amount(15)).toBe(0);
    expect(calculateParkingFee(rate, 15).lines).toEqual([{ concept: "Dentro de la tolerancia (15 min)", amount: 0 }]);
    expect(amount(16)).toBe(20);
  });

  it("charges the first block, then every started fraction whole", () => {
    expect(amount(60)).toBe(20);
    expect(amount(61)).toBe(25);
    expect(amount(75)).toBe(25);
    expect(amount(76)).toBe(30);
    expect(calculateParkingFee(rate, 80)).toEqual({ amount: 30, lines: [
      { concept: "Primer bloque (60 min)", amount: 20 },
      { concept: "2 fracciones de 15 min", amount: 10 },
    ] });
  });

  it("stops at the daily cap within the first day", () => {
    // 60 + 26 fractions = 450 min = $150 exactly; one minute more would be $155.
    expect(amount(450)).toBe(150);
    expect(amount(451)).toBe(150);
    expect(calculateParkingFee(rate, 451).lines.at(-1)).toEqual({ concept: "Tope diario ($150.00)", amount: -5 });
    expect(amount(DAY - 1)).toBe(150);
  });

  it("charges each full day up to the cap and keeps counting fractions after it", () => {
    expect(amount(DAY)).toBe(150);
    expect(amount(DAY + 16)).toBe(160);
    expect(calculateParkingFee(rate, DAY + 16).lines).toEqual([
      { concept: "1 dia completo (tope $150.00)", amount: 150 },
      { concept: "2 fracciones de 15 min adicionales", amount: 10 },
    ]);
    // 3 days and 500 min: 3 × $150 + the extra time capped at $150.
    expect(amount(3 * DAY + 500)).toBe(600);
    // A day that costs less than the cap is charged what it costs.
    expect(amount(2 * DAY, { ...rate, dailyMax: 10_000 })).toBe(2 * (20 + 92 * 5));
  });

  it("without a cap counts one continuous stay", () => {
    expect(amount(3000, { ...rate, dailyMax: null })).toBe(20 + Math.ceil(2940 / 15) * 5);
  });

  it("adds cents exactly", () => {
    const cents = { ...rate, firstBlockPrice: 12.5, fractionPrice: 0.1, dailyMax: null };
    expect(amount(61, cents)).toBe(12.6);
    expect(amount(60 + 15 * 3, cents)).toBe(12.8);
  });

  it("keeps the legacy fixed rate while none is configured", () => {
    expect(legacyParkingFee(59).amount).toBe(10);
    expect(legacyParkingFee(60).amount).toBe(20);
    expect(legacyParkingFee(5000).amount).toBe(20);
  });

  it("rejects rates that make no sense", () => {
    expect(validateParkingRate(rate)).toBeNull();
    expect(validateParkingRate({ ...rate, toleranceMinutes: 60 })).toContain("tolerancia");
    expect(validateParkingRate({ ...rate, fractionMinutes: 0 })).toContain("fraccion");
    expect(validateParkingRate({ ...rate, firstBlockPrice: 0 })).toContain("primer bloque");
    expect(validateParkingRate({ ...rate, fractionPrice: 5.555 })).toContain("decimales");
    expect(validateParkingRate({ ...rate, dailyMax: 10 })).toContain("tope");
    expect(validateParkingRate({ ...rate, firstBlockMinutes: 1441 })).toContain("primer bloque");
  });
});
