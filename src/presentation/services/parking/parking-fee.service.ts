import {
  calculateParkingFee,
  legacyParkingFee,
  type FeeLine,
} from "../../../domain/entities/parking/parking-rate.entity";
import { ParkingRateRepository } from "../../../domain/repositories/parking/parking-rate.repository";

export interface TicketQuote {
  /** Whole minutes, as stored on the ticket. */
  duracion: number;
  monto: number;
  /** Rate version used; null with the legacy fixed rate (no rate configured). */
  tarifaVersion: number | null;
  lines: FeeLine[];
}

/** The one place a stay is priced: tickets, the cashier and the app all quote through it. */
export class ParkingFeeService {
  constructor(private readonly rates: ParkingRateRepository) {}

  async quote(proyectoId: string, horaInicio: number, now = Date.now()): Promise<TicketQuote> {
    const duracion = Math.max(0, Math.round((now - horaInicio) / 1000 / 60));
    const rate = await this.rates.findCurrent(proyectoId);
    const fee = rate ? calculateParkingFee(rate, duracion) : legacyParkingFee(duracion);
    return { duracion, monto: fee.amount, tarifaVersion: rate?.version ?? null, lines: fee.lines };
  }
}
