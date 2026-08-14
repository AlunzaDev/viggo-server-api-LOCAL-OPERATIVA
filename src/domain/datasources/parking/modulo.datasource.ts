import {
    ModuloCreateValues,
    ModuloEntity,
    ModuloSubmodulo,
    ModuloUpdateValues,
} from "../../entities/parking/modulo.entity";
import { ModuloTipo } from "../../entities/parking/module-type.entity";

export interface ModuloFilters {
    proyecto?: string;
    tipo?: ModuloTipo;
    estado?: boolean;
}

export abstract class ModuloDatasource {
    abstract create(modulo: ModuloCreateValues): Promise<ModuloEntity>;
    abstract findById(id: string): Promise<ModuloEntity | null>;
    abstract findByIdentificador(identificador: string): Promise<ModuloEntity | null>;
    abstract getAll(): Promise<ModuloEntity[]>;
    abstract getWithPendingDeviceBindingRequests(): Promise<ModuloEntity[]>;
    abstract getFiltered(filters: ModuloFilters): Promise<ModuloEntity[]>;
    abstract getByProyecto(proyectoId: string): Promise<ModuloEntity[]>;
    abstract getSubmodulos(id: string): Promise<ModuloSubmodulo[] | null>;
    abstract update(
        id: string,
        modulo: ModuloUpdateValues,
    ): Promise<ModuloEntity | null>;
    abstract resetDeviceBinding(id: string): Promise<ModuloEntity | null>;
    abstract delete(id: string): Promise<ModuloEntity | null>;
}
