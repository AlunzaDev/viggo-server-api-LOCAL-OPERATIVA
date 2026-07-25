export type LocalReportsSnapshotPayload = {
  proyectoId: string;
  from: number;
  to: number;
};

export abstract class LocalReportsDatasource {
  abstract getInstallation(): Promise<any>;
  abstract getHealth(): any;
  abstract getSnapshotData(payload: LocalReportsSnapshotPayload): Promise<any>;
}
