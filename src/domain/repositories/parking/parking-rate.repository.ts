import type { ParkingRate, ParkingRateRules } from "../../entities/parking/parking-rate.entity";

export abstract class ParkingRateRepository {
    abstract findCurrent(proyectoId: string): Promise<ParkingRate | null>;
    abstract getHistory(proyectoId: string, limit: number): Promise<ParkingRate[]>;
    abstract createVersion(proyectoId: string, rules: ParkingRateRules, createdBy: string): Promise<ParkingRate>;
}
