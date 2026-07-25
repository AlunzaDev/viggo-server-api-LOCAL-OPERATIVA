import type { LocalReportsSnapshotPayload } from "../../datasources/local-reports/local-reports.datasource";

export abstract class LocalReportsRepository {
  abstract getInstallation(): Promise<any>;
  abstract getHealth(): any;
  abstract getSnapshotData(payload: LocalReportsSnapshotPayload): Promise<any>;
}
