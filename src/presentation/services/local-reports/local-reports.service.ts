import type { LocalReportsSnapshotPayload } from "../../../domain/datasources/local-reports/local-reports.datasource";
import { LocalReportsRepository } from "../../../domain/repositories/local-reports/local-reports.repository";
import { ModuloService } from "../parking/modulo.service";

export class LocalReportsService {
  constructor(
    private readonly repository: LocalReportsRepository,
    private readonly moduloService: ModuloService,
  ) {}

  getInstallation() {
    return this.repository.getInstallation();
  }

  getHealth() {
    return this.repository.getHealth();
  }

  getSnapshotData(payload: LocalReportsSnapshotPayload) {
    return this.repository.getSnapshotData(payload);
  }

  getHeartbeatSnapshot(proyectoId: string) {
    return this.moduloService.getHeartbeatSnapshot(proyectoId);
  }
}
