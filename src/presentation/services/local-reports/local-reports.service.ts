import type { LocalReportsSnapshotPayload } from "../../../domain/datasources/local-reports/local-reports.datasource";
import { LocalReportsRepository } from "../../../domain/repository/local-reports/local-reports.repository";

export class LocalReportsService {
  constructor(private readonly repository: LocalReportsRepository) {}

  getInstallation() {
    return this.repository.getInstallation();
  }

  getHealth() {
    return this.repository.getHealth();
  }

  getSnapshotData(payload: LocalReportsSnapshotPayload) {
    return this.repository.getSnapshotData(payload);
  }
}
