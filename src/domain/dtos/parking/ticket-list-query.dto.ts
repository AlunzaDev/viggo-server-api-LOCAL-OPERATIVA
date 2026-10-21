/** Filters of the ticket list: parking, status, paid (`true/false/1/0/yes/no/on/off`), entry period and free text. */
export class TicketListQueryDto {
  private constructor(
    public readonly proyecto: string,
    public readonly status: string,
    public readonly pagado: boolean | undefined,
    public readonly search: string,
    public readonly from?: number,
    public readonly to?: number,
  ) {}

  /** `period`: the entry period already read from the query (instants in ms). */
  static create(query: Record<string, unknown>, period: { from?: number; to?: number } = {}): [string?, TicketListQueryDto?] {
    let pagado: boolean | undefined;
    if (query.pagado !== undefined) {
      const value = typeof query.pagado === "boolean" ? String(query.pagado) : typeof query.pagado === "string" ? query.pagado.trim().toLowerCase() : "";
      if (["true", "1", "yes", "on"].includes(value)) pagado = true;
      else if (["false", "0", "no", "off"].includes(value)) pagado = false;
      else return ["'pagado' debe ser boolean"];
    }
    return [undefined, new TicketListQueryDto(
      typeof query.proyecto === "string" ? query.proyecto.trim() : "",
      typeof query.status === "string" ? query.status.trim().toUpperCase() : "",
      pagado,
      typeof query.search === "string" ? query.search.trim() : "",
      period.from,
      period.to,
    )];
  }
}
