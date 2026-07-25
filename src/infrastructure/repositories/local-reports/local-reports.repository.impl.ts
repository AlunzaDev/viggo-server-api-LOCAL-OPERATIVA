import type {
  LocalReportsDatasource,
  LocalReportsSnapshotPayload,
} from "../../../domain/datasources/local-reports/local-reports.datasource";
import { LocalReportsRepository } from "../../../domain/repository/local-reports/local-reports.repository";

export class LocalReportsRepositoryImpl implements LocalReportsRepository {
  constructor(private readonly datasource: LocalReportsDatasource) {}

  getInstallation() {
    return this.datasource.getInstallation();
  }

  getHealth() {
    return this.datasource.getHealth();
  }

  getSnapshotData(payload: LocalReportsSnapshotPayload) {
    return this.datasource.getSnapshotData(payload);
  }
}
