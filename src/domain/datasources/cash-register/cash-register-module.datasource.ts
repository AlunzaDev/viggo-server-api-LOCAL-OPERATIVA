export type CashRegisterModuloProjection = {
  id: string;
  proyectoId: string;
  tipo: string;
  estado: boolean;
  identificador?: string;
  nombre?: string;
};

export abstract class CashRegisterModuleDatasource {
  abstract findById(moduloId: string): Promise<CashRegisterModuloProjection | null>;
}
