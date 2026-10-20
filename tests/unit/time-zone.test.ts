import { describe, expect, it } from "vitest";
import { ProyectoEntity } from "../../src/domain/entities/parking/proyecto.entity";
import { DEFAULT_TIME_ZONE, isValidTimeZone, localClock } from "../../src/domain/entities/parking/time-zone";

describe("parking time zone", () => {
  it("reads the parking's local day and time, not the server's", () => {
    // Thursday 2026-10-22 05:30 UTC.
    const at = Date.UTC(2026, 9, 22, 5, 30);
    expect(localClock(at, "America/Mexico_City")).toEqual({ weekDay: 3, minutes: 23 * 60 + 30 }); // Wednesday 23:30
    expect(localClock(at, "America/Tijuana")).toEqual({ weekDay: 3, minutes: 22 * 60 + 30 });     // Wednesday 22:30
    expect(localClock(at, "America/Cancun")).toEqual({ weekDay: 4, minutes: 30 });                // Thursday 00:30
    // An unknown zone falls back to the default instead of failing.
    expect(localClock(at, "Marte/Olympus")).toEqual(localClock(at, DEFAULT_TIME_ZONE));
  });

  it("accepts real IANA zones only", () => {
    expect(isValidTimeZone("America/Tijuana")).toBe(true);
    expect(isValidTimeZone("Hora del centro")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("keeps the zone that arrives with the project, or the default for older clouds", () => {
    const base = { _id: "p1", nombre: "Plaza", coordinates: [0, 0], ciudad: "TIJ", identificador: "P-1", estado: true };
    expect(ProyectoEntity.fromObject({ ...base, zonaHoraria: "America/Tijuana" }).zonaHoraria).toBe("America/Tijuana");
    expect(ProyectoEntity.fromObject(base).zonaHoraria).toBe(DEFAULT_TIME_ZONE);
    expect(ProyectoEntity.fromObject({ ...base, zonaHoraria: "no-existe" }).zonaHoraria).toBe(DEFAULT_TIME_ZONE);
  });
});
