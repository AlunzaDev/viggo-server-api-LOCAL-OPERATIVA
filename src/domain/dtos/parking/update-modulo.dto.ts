import {
    MODULO_TIPOS,
    ModuloTipo,
    parseModuloTipo,
} from "../../entities/parking/module-type.entity";

export class UpdateModuloDto {
    private constructor(
        public readonly nombre?: string,
        public readonly proyecto?: string,
        public readonly tipo?: ModuloTipo,
        public readonly identificador?: string,
        public readonly estado?: boolean,
        public readonly descripcion?: string,
    ) {}

    static create(body: Record<string, unknown>): [string?, UpdateModuloDto?] {
        const parsedTipo = body.tipo === undefined ? undefined : parseModuloTipo(body.tipo);
        if (body.tipo !== undefined && !parsedTipo) {
            return [`'tipo' debe ser uno de: ${MODULO_TIPOS.join(", ")}`];
        }
        const tipo = parsedTipo ?? undefined;

        return [
            undefined,
            new UpdateModuloDto(
                typeof body.nombre === "string" ? body.nombre.trim() : undefined,
                typeof body.proyecto === "string" ? body.proyecto.trim() : undefined,
                tipo,
                typeof body.identificador === "string"
                    ? body.identificador.trim()
                    : undefined,
                typeof body.estado === "boolean" ? body.estado : undefined,
                typeof body.descripcion === "string"
                    ? body.descripcion.trim()
                    : undefined,
            ),
        ];
    }
}
