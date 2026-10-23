import {
    MODULE_TYPE_CAPABILITIES,
    MODULE_TYPES,
    type ModuleTypeCapabilities,
} from "@alunzadev/viggo-contracts";
import type { ModuloTipo } from "./module-type.entity";

export type ModuloTypeCapabilities = ModuleTypeCapabilities;

export const MODULO_TYPE_CAPABILITIES = MODULE_TYPE_CAPABILITIES;

export const getModuloTypeCapabilities = (
    tipo: ModuloTipo,
): ModuloTypeCapabilities => MODULO_TYPE_CAPABILITIES[tipo];

export const getModuloTypesRequiringDeviceBinding = (): ModuloTipo[] =>
    MODULE_TYPES.filter(
        (tipo) => MODULO_TYPE_CAPABILITIES[tipo].requiresDeviceBinding,
    );
