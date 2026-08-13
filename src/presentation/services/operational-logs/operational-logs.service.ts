import type {
  OperationalLogRepository,
} from "../../../domain/repositories/system/operational-log.repository";
import type { OperationalLogListResult } from "../../../domain/datasources/system/operational-log.datasource";
import type { MonthlyFlushRepository } from "../../../domain/repositories/system/monthly-flush.repository";
import {
  OperationalLogEntity,
  type OperationalLogKind,
  type OperationalLogScope,
  type OperationalLogSeverity,
  type OperationalLogSource,
} from "../../../domain/entities/system/operational-log.entity";
import type { ModuloRepository } from "../../../domain/repositories/parking/modulo.repository";
import type { ProyectoRepository } from "../../../domain/repositories/parking/proyecto.repository";
import { InstallationIdentityService } from "../installation/installation-identity.service";

export interface CreateOperationalLogInput {
  kind: OperationalLogKind;
  scope: OperationalLogScope;
  type: string;
  severity?: OperationalLogSeverity;
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
  createdAt?: number;
}

export interface OperationalLogQuery {
  page: number;
  limit: number;
  kind?: OperationalLogKind;
  scope?: OperationalLogScope;
  severity?: OperationalLogSeverity;
  projectId?: string;
  projectIds?: string[];
  moduloId?: string;
  ticketId?: string;
  type?: string;
  search?: string;
  from?: number;
  to?: number;
}

const normalizeText = (value: unknown) => String(value ?? "").trim();

export class OperationalLogsService {
  constructor(
    private readonly repository: OperationalLogRepository,
    private readonly monthlyFlushRepository: MonthlyFlushRepository,
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async logEvent(input: Omit<CreateOperationalLogInput, "kind">): Promise<void> {
    await this.log({ ...input, kind: "event", severity: input.severity ?? "info" });
  }

  async logIncident(input: Omit<CreateOperationalLogInput, "kind">): Promise<void> {
    await this.log({ ...input, kind: "incident", severity: input.severity ?? "warning" });
  }

  async log(input: CreateOperationalLogInput): Promise<void> {
    try {
      const type = normalizeText(input.type);
      const message = normalizeText(input.message);

      if (!type || !message) {
        return;
      }

      const createdAt = Number.isFinite(Number(input.createdAt))
        ? Number(input.createdAt)
        : Date.now();
      const context = await this.resolveContext(input);

      await this.repository.create(new OperationalLogEntity({
        id: "",
        kind: input.kind,
        scope: input.scope,
        type,
        severity: input.severity ?? (input.kind === "incident" ? "warning" : "info"),
        installationId: context.installationId,
        projectId: context.projectId,
        projectName: context.projectName,
        moduloId: context.moduloId,
        moduloNombre: context.moduloNombre,
        submoduloId: normalizeText(input.submoduloId),
        submoduloNombre: normalizeText(input.submoduloNombre),
        ticketId: normalizeText(input.ticketId),
        paymentSessionId: normalizeText(input.paymentSessionId),
        flowId: normalizeText(input.flowId),
        source: input.source,
        message,
        statusBefore: normalizeText(input.statusBefore),
        statusAfter: normalizeText(input.statusAfter),
        metadata: input.metadata ?? {},
        createdAt,
        updatedAt: Date.now(),
      }));
    } catch (error) {
      console.error("[OPERATIVO logs] No se pudo guardar bitacora operativa", error);
    }
  }

  async list(query: OperationalLogQuery): Promise<OperationalLogListResult> {
    const [liveResult, flushedSummaries] = await Promise.all([
      this.repository.list({
        ...query,
        page: 1,
        limit: 5000,
      }),
      this.monthlyFlushRepository.listSummaries(query),
    ]);

    const flushedLogs = flushedSummaries.map(
      (summary) =>
        new OperationalLogEntity({
          id: `flushed-log-${summary.id}`,
          kind: summary.kind,
          scope: summary.scope,
          type: summary.type,
          severity: summary.severity,
          installationId: summary.installationId,
          projectId: summary.projectId,
          projectName: summary.projectName,
          moduloId: summary.moduloId,
          moduloNombre: summary.moduloNombre,
          submoduloId: "",
          submoduloNombre: "",
          ticketId: "",
          paymentSessionId: "",
          flowId: "",
          source: summary.source,
          message: summary.sampleMessage || `${summary.totalLogs} movimientos registrados`,
          statusBefore: "",
          statusAfter: "",
          metadata: summary.totalLogs > 1 ? { registros: summary.totalLogs } : {},
          createdAt: summary.lastCreatedAt,
          updatedAt: summary.updatedAt,
        }),
    );

    const mergedLogs = [...liveResult.logs, ...flushedLogs].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const total = mergedLogs.length;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const startIndex = Math.max(0, (query.page - 1) * query.limit);
    const pagedLogs = mergedLogs.slice(startIndex, startIndex + query.limit);
    const summary = mergedLogs.reduce<OperationalLogListResult["summary"]>(
      (acc, item) => {
        acc.byKind[item.kind] = (acc.byKind[item.kind] ?? 0) + 1;
        acc.bySeverity[item.severity] = (acc.bySeverity[item.severity] ?? 0) + 1;
        return acc;
      },
      { byKind: {}, bySeverity: {} },
    );

    return {
      logs: pagedLogs,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      summary,
    };
  }

  private async resolveContext(input: CreateOperationalLogInput) {
    const explicitModuloId = normalizeText(input.moduloId);
    const explicitProjectId = normalizeText(input.projectId);
    const explicitInstallationId = normalizeText(input.installationId);

    const [installationId, moduloDocument] = await Promise.all([
      explicitInstallationId
        ? Promise.resolve(explicitInstallationId)
        : InstallationIdentityService.getInstallationId().catch(() => ""),
      explicitModuloId ? this.moduloRepository.findById(explicitModuloId) : Promise.resolve(null),
    ]);

    const moduloNombre =
      normalizeText(input.moduloNombre) ||
      normalizeText(moduloDocument?.nombre);

    const projectId =
      explicitProjectId ||
      normalizeText(moduloDocument?.proyecto);

    const projectNameInput = normalizeText(input.projectName);
    let projectName = projectNameInput;

    if (!projectName && projectId) {
      const projectDocument = await this.proyectoRepository.findById(projectId);
      projectName = normalizeText(projectDocument?.nombre);
    }

    return {
      installationId,
      projectId,
      projectName,
      moduloId: explicitModuloId,
      moduloNombre,
    };
  }
}
