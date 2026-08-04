import { CustomError } from "../../errors/custom.error";

export const OPERATIONAL_LOG_KINDS = ["event", "incident"] as const;
export const OPERATIONAL_LOG_SCOPES = ["access_flow", "device", "payment", "system"] as const;
export const OPERATIONAL_LOG_SEVERITIES = ["info", "warning", "critical"] as const;
export const OPERATIONAL_LOG_SOURCES = ["backend", "device", "app", "sync", "system"] as const;

export type OperationalLogKind = (typeof OPERATIONAL_LOG_KINDS)[number];
export type OperationalLogScope = (typeof OPERATIONAL_LOG_SCOPES)[number];
export type OperationalLogSeverity = (typeof OPERATIONAL_LOG_SEVERITIES)[number];
export type OperationalLogSource = (typeof OPERATIONAL_LOG_SOURCES)[number];

export interface OperationalLogEntityOptions {
  id: string;
  kind: OperationalLogKind;
  scope: OperationalLogScope;
  type: string;
  severity: OperationalLogSeverity;
  installationId?: string;
  projectId?: string;
  projectName?: string;
  moduloId?: string;
  moduloNombre?: string;
  submoduloId?: string;
  submoduloNombre?: string;
  ticketId?: string;
  paymentSessionId?: string;
  flowId?: string;
  source: OperationalLogSource;
  message: string;
  statusBefore?: string;
  statusAfter?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class OperationalLogEntity {
  public id: string;
  public kind: OperationalLogKind;
  public scope: OperationalLogScope;
  public type: string;
  public severity: OperationalLogSeverity;
  public installationId?: string;
  public projectId?: string;
  public projectName?: string;
  public moduloId?: string;
  public moduloNombre?: string;
  public submoduloId?: string;
  public submoduloNombre?: string;
  public ticketId?: string;
  public paymentSessionId?: string;
  public flowId?: string;
  public source: OperationalLogSource;
  public message: string;
  public statusBefore?: string;
  public statusAfter?: string;
  public metadata?: Record<string, unknown>;
  public createdAt: number;
  public updatedAt: number;

  constructor(options: OperationalLogEntityOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.scope = options.scope;
    this.type = options.type;
    this.severity = options.severity;
    this.installationId = options.installationId;
    this.projectId = options.projectId;
    this.projectName = options.projectName;
    this.moduloId = options.moduloId;
    this.moduloNombre = options.moduloNombre;
    this.submoduloId = options.submoduloId;
    this.submoduloNombre = options.submoduloNombre;
    this.ticketId = options.ticketId;
    this.paymentSessionId = options.paymentSessionId;
    this.flowId = options.flowId;
    this.source = options.source;
    this.message = options.message;
    this.statusBefore = options.statusBefore;
    this.statusAfter = options.statusAfter;
    this.metadata = options.metadata;
    this.createdAt = options.createdAt;
    this.updatedAt = options.updatedAt;
  }

  static fromObject(object: Record<string, unknown>): OperationalLogEntity {
    const {
      _id,
      id,
      kind,
      scope,
      type,
      severity,
      installationId,
      projectId,
      projectName,
      moduloId,
      moduloNombre,
      submoduloId,
      submoduloNombre,
      ticketId,
      paymentSessionId,
      flowId,
      source,
      message,
      statusBefore,
      statusAfter,
      metadata,
      createdAt,
      updatedAt,
    } = object;

    const logId = id || (_id ? String(_id) : undefined);

    if (!logId) throw CustomError.badRequest("Missing id");
    if (!kind) throw CustomError.badRequest("Missing kind");
    if (!scope) throw CustomError.badRequest("Missing scope");
    if (!type) throw CustomError.badRequest("Missing type");
    if (!severity) throw CustomError.badRequest("Missing severity");
    if (!source) throw CustomError.badRequest("Missing source");
    if (!message) throw CustomError.badRequest("Missing message");
    if (createdAt === undefined || createdAt === null) throw CustomError.badRequest("Missing createdAt");
    if (updatedAt === undefined || updatedAt === null) throw CustomError.badRequest("Missing updatedAt");

    if (typeof kind !== "string" || !OPERATIONAL_LOG_KINDS.includes(kind as OperationalLogKind)) {
      throw CustomError.badRequest("Invalid operational log kind");
    }
    if (typeof scope !== "string" || !OPERATIONAL_LOG_SCOPES.includes(scope as OperationalLogScope)) {
      throw CustomError.badRequest("Invalid operational log scope");
    }
    if (typeof severity !== "string" || !OPERATIONAL_LOG_SEVERITIES.includes(severity as OperationalLogSeverity)) {
      throw CustomError.badRequest("Invalid operational log severity");
    }
    if (typeof source !== "string" || !OPERATIONAL_LOG_SOURCES.includes(source as OperationalLogSource)) {
      throw CustomError.badRequest("Invalid operational log source");
    }

    return new OperationalLogEntity({
      id: String(logId),
      kind: kind as OperationalLogKind,
      scope: scope as OperationalLogScope,
      type: String(type).trim(),
      severity: severity as OperationalLogSeverity,
      installationId: installationId ? String(installationId).trim() : undefined,
      projectId: projectId ? String(projectId).trim() : undefined,
      projectName: projectName ? String(projectName).trim() : undefined,
      moduloId: moduloId ? String(moduloId).trim() : undefined,
      moduloNombre: moduloNombre ? String(moduloNombre).trim() : undefined,
      submoduloId: submoduloId ? String(submoduloId).trim() : undefined,
      submoduloNombre: submoduloNombre ? String(submoduloNombre).trim() : undefined,
      ticketId: ticketId ? String(ticketId).trim() : undefined,
      paymentSessionId: paymentSessionId ? String(paymentSessionId).trim() : undefined,
      flowId: flowId ? String(flowId).trim() : undefined,
      source: source as OperationalLogSource,
      message: String(message).trim(),
      statusBefore: statusBefore ? String(statusBefore).trim() : undefined,
      statusAfter: statusAfter ? String(statusAfter).trim() : undefined,
      metadata: metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined,
      createdAt: Number(createdAt),
      updatedAt: Number(updatedAt),
    });
  }
}
