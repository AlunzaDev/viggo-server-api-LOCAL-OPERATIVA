import { ParkingRateDatasource } from "../../../domain/datasources/parking/parking-rate.datasource";
import type { ParkingRateRules } from "../../../domain/entities/parking/parking-rate.entity";
import { ParkingRateRepository } from "../../../domain/repositories/parking/parking-rate.repository";

export class ParkingRateRepositoryImpl implements ParkingRateRepository {
    constructor(private readonly datasource: ParkingRateDatasource) {}

    findCurrent(proyectoId: string) {
        return this.datasource.findCurrent(proyectoId);
    }

    getHistory(proyectoId: string, limit: number) {
        return this.datasource.getHistory(proyectoId, limit);
    }

    createVersion(proyectoId: string, rules: ParkingRateRules, createdBy: string) {
        return this.datasource.createVersion(proyectoId, rules, createdBy);
    }
}
