import { PensionMoveEntity, type PensionPassageTipo } from "../../entities/pension/pension-move.entity";
import type { TransactionContext } from "../system/transaction";

export interface PensionPassageInput {
    pensionPassId: string;
    moduloId: string;
    proyectoId: string;
    tipo: PensionPassageTipo;
    fecha: number;
}

export abstract class PensionMoveDatasource {
    abstract create(pensionMove: Omit<PensionMoveEntity, "id">): Promise<PensionMoveEntity>;
    abstract findById(id: string): Promise<PensionMoveEntity | null>;
    abstract getAll(): Promise<PensionMoveEntity[]>;
    abstract getByPensionPass(pensionPassId: string): Promise<PensionMoveEntity[]>;
    abstract getByProyecto(proyectoId: string): Promise<PensionMoveEntity[]>;
    abstract update(
        id: string,
        pensionMove: Partial<Omit<PensionMoveEntity, "id">>,
    ): Promise<PensionMoveEntity | null>;
    abstract delete(id: string): Promise<PensionMoveEntity | null>;
    /**
     * Atomically checks anti-passback against the stored state, flips the pass's inParking
     * and records the move. Concurrent passages of the same pass run one after the other.
     */
    abstract registerPassage(input: PensionPassageInput, tx?: TransactionContext): Promise<PensionMoveEntity>;
}