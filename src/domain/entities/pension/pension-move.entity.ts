import { CustomError } from "../../errors/custom.error";

export type PensionMoveTipo =
    | "ENTRADA"
    | "SALIDA"
    | "ENTRADA-PENSION"
    | "SALIDA-PENSION";

/** Direction of a pass through an entry or exit module. */
export type PensionPassageTipo = "ENTRADA" | "SALIDA";

/**
 * Anti-passback: a pass can only enter when it is outside and only exit when it is inside.
 * Throws the error shown to the user otherwise.
 */
export const assertPensionPassage = (inParking: boolean, tipo: PensionPassageTipo): void => {
    if (inParking && tipo === "ENTRADA") {
        throw CustomError.badRequest(
            "La ultima vez uso su pension sin marcar salida, consulte al proveedor",
            undefined,
            "PENSION_PASSBACK_ENTRY",
        );
    }

    if (!inParking && tipo === "SALIDA") {
        throw CustomError.badRequest(
            "No ha marcado entrada al estacionamiento, consulte al proveedor",
            undefined,
            "PENSION_PASSBACK_EXIT",
        );
    }
};

export interface PensionMoveEntityOptions {
    id: string;
    modulo: string;
    proyecto: string;
    pensionPass: string;
    tipo: PensionMoveTipo;
    fecha: number;
}

export class PensionMoveEntity {
    public id: string;
    public modulo: string;
    public proyecto: string;
    public pensionPass: string;
    public tipo: PensionMoveTipo;
    public fecha: number;

    constructor(options: PensionMoveEntityOptions) {
        const { id, modulo, proyecto, pensionPass, tipo, fecha } = options;

        this.id = id;
        this.modulo = modulo;
        this.proyecto = proyecto;
        this.pensionPass = pensionPass;
        this.tipo = tipo;
        this.fecha = fecha;
    }

    static fromObject(object: { [key: string]: unknown }): PensionMoveEntity {
        const { _id, id, modulo, proyecto, pensionPass, tipo, fecha } = object;

        const pensionMoveId = id || (_id ? String(_id) : undefined);

        if (!pensionMoveId) throw CustomError.badRequest("Missing id");
        if (!modulo) throw CustomError.badRequest("Missing modulo");
        if (!proyecto) throw CustomError.badRequest("Missing proyecto");
        if (!pensionPass) throw CustomError.badRequest("Missing pensionPass");
        if (!tipo) throw CustomError.badRequest("Missing tipo");
        if (fecha === undefined || fecha === null) {
            throw CustomError.badRequest("Missing fecha");
        }

        return new PensionMoveEntity({
            id: String(pensionMoveId),
            modulo: String(modulo),
            proyecto: String(proyecto),
            pensionPass: String(pensionPass),
            tipo: String(tipo) as PensionMoveTipo,
            fecha: Number(fecha),
        });
    }
}
