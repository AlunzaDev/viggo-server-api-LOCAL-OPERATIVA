import type { ParkingRate, ParkingRateRules } from "../../entities/parking/parking-rate.entity";

export abstract class ParkingRateDatasource {
    /** Highest version of the project's rate; null while none has been configured. */
    abstract findCurrent(proyectoId: string): Promise<ParkingRate | null>;
    /** Every version, newest first. */
    abstract getHistory(proyectoId: string, limit: number): Promise<ParkingRate[]>;
    /** Saves the rules as the next version (versions never change once written). */
    abstract createVersion(proyectoId: string, rules: ParkingRateRules, createdBy: string): Promise<ParkingRate>;
}
