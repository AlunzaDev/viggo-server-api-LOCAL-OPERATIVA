import type {
  OperationalLogKind,
  OperationalLogScope,
  OperationalLogSeverity,
  OperationalLogSource,
} from "./operational-log.entity";

export type OperationalLogFlushType = "monthly" | "partial";

export interface OperationalLogFlushSummaryEntityOptions {
  id: string;
  monthKey: string;
  dayKey: string;
  flushType: OperationalLogFlushType;
  kind: OperationalLogKind;
  scope: OperationalLogScope;
  severity: OperationalLogSeverity;
  type: string;
  installationId?: string;
  projectId?: string;
  projectName?: string;
  moduloId?: string;
  moduloNombre?: string;
  source: OperationalLogSource;
  totalLogs: number;
  firstCreatedAt: number;
  lastCreatedAt: number;
  sampleMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export class OperationalLogFlushSummaryEntity {
  public id: string;
  public monthKey: string;
  public dayKey: string;
  public flushType: OperationalLogFlushType;
  public kind: OperationalLogKind;
  public scope: OperationalLogScope;
  public severity: OperationalLogSeverity;
  public type: string;
  public installationId?: string;
  public projectId?: string;
  public projectName?: string;
  public moduloId?: string;
  public moduloNombre?: string;
  public source: OperationalLogSource;
  public totalLogs: number;
  public firstCreatedAt: number;
  public lastCreatedAt: number;
  public sampleMessage?: string;
  public createdAt: number;
  public updatedAt: number;

  constructor(options: OperationalLogFlushSummaryEntityOptions) {
    this.id = options.id;
    this.monthKey = options.monthKey;
    this.dayKey = options.dayKey;
    this.flushType = options.flushType;
    this.kind = options.kind;
    this.scope = options.scope;
    this.severity = options.severity;
    this.type = options.type;
    this.installationId = options.installationId;
    this.projectId = options.projectId;
    this.projectName = options.projectName;
    this.moduloId = options.moduloId;
    this.moduloNombre = options.moduloNombre;
    this.source = options.source;
    this.totalLogs = options.totalLogs;
    this.firstCreatedAt = options.firstCreatedAt;
    this.lastCreatedAt = options.lastCreatedAt;
    this.sampleMessage = options.sampleMessage;
    this.createdAt = options.createdAt;
    this.updatedAt = options.updatedAt;
  }
}
