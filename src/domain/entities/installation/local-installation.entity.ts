export class LocalInstallationEntity {
  constructor(
    public id: string,
    public key: string,
    public installationId?: string,
    public proyectoId?: string,
    public proyectoNombre?: string,
    public proyectoIdentificador?: string,
    public status?: string,
    public source?: string,
    public cloudRequestId?: string,
    public encryptedSyncToken?: string,
    public assignedAt?: number,
    public updatedAt?: number,
  ) {}

  static fromObject(object: Record<string, unknown>) {
    return new LocalInstallationEntity(
      String(object.id ?? object._id ?? ""),
      String(object.key ?? ""),
      optionalString(object.installationId),
      optionalString(object.proyectoId),
      optionalString(object.proyectoNombre),
      optionalString(object.proyectoIdentificador),
      optionalString(object.status),
      optionalString(object.source),
      optionalString(object.cloudRequestId),
      optionalString(object.encryptedSyncToken),
      optionalNumber(object.assignedAt),
      optionalNumber(object.updatedAt),
    );
  }
}

const optionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

const optionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
