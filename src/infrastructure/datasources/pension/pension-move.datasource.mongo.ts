import { PensionMoveModel } from "../../../data/mongo/models/pension/pension-move.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import {
    PensionMoveDatasource,
    type PensionPassageInput,
} from "../../../domain/datasources/pension/pension-move.datasource";
import type { TransactionContext } from "../../../domain/datasources/system/transaction";
import { assertPensionPassage, PensionMoveEntity } from "../../../domain/entities/pension/pension-move.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { mongoSession } from "../system/transaction-runner.mongo";

export class PensionMoveMongoDatasource extends PensionMoveDatasource {
    async create(pensionMove: Omit<PensionMoveEntity, "id">): Promise<PensionMoveEntity> {
        const pensionMoveDocument = await PensionMoveModel.create(pensionMove);
        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }

    async findById(id: string): Promise<PensionMoveEntity | null> {
        const pensionMoveDocument = await PensionMoveModel.findById(id);
        if (!pensionMoveDocument) return null;

        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }

    async getAll(): Promise<PensionMoveEntity[]> {
        const pensionMoves = await PensionMoveModel.find();
        return pensionMoves.map((pensionMove) =>
            PensionMoveEntity.fromObject(pensionMove.toObject()),
        );
    }

    async getByPensionPass(pensionPassId: string): Promise<PensionMoveEntity[]> {
        const pensionMoves = await PensionMoveModel.find({ pensionPass: pensionPassId });
        return pensionMoves.map((pensionMove) =>
            PensionMoveEntity.fromObject(pensionMove.toObject()),
        );
    }

    async getByProyecto(proyectoId: string): Promise<PensionMoveEntity[]> {
        const pensionMoves = await PensionMoveModel.find({ proyecto: proyectoId });
        return pensionMoves.map((pensionMove) =>
            PensionMoveEntity.fromObject(pensionMove.toObject()),
        );
    }

    async update(
        id: string,
        pensionMove: Partial<Omit<PensionMoveEntity, "id">>,
    ): Promise<PensionMoveEntity | null> {
        const pensionMoveDocument = await PensionMoveModel.findByIdAndUpdate(id, pensionMove, {
            new: true,
        });

        if (!pensionMoveDocument) return null;

        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }

    async registerPassage(input: PensionPassageInput, tx?: TransactionContext): Promise<PensionMoveEntity> {
        const session = mongoSession(tx);
        const entering = input.tipo === "ENTRADA";
        // Conditional update: only one of two concurrent passages finds the expected state.
        const updated = await PensionPassModel.findOneAndUpdate(
            { _id: input.pensionPassId, inParking: !entering },
            { $set: { inParking: entering } },
            { new: true, session },
        );
        if (!updated) {
            const current = await PensionPassModel.findById(input.pensionPassId).session(session ?? null);
            if (!current) throw CustomError.notFound("PensionPass no encontrado");
            assertPensionPassage(Boolean(current.inParking), input.tipo);
        }
        const [move] = await PensionMoveModel.create(
            [{ pensionPass: input.pensionPassId, modulo: input.moduloId, proyecto: input.proyectoId, tipo: input.tipo, fecha: input.fecha }],
            { session },
        );
        return PensionMoveEntity.fromObject(move.toObject());
    }

    async delete(id: string): Promise<PensionMoveEntity | null> {
        const pensionMoveDocument = await PensionMoveModel.findByIdAndDelete(id);

        if (!pensionMoveDocument) return null;

        return PensionMoveEntity.fromObject(pensionMoveDocument.toObject());
    }
}