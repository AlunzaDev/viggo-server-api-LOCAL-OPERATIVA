export interface DatabaseHealth {
  status: "ok" | "error";
  [detail: string]: unknown;
}

export interface DeviceCounts {
  /** Active modules with a bound device. */
  total: number;
  /** Active modules connected with a heartbeat after `staleBefore`. */
  connected: number;
  /** Active bound modules disconnected or without a recent heartbeat. */
  stale: number;
}

export abstract class HealthDatasource {
  abstract getDatabaseHealth(): DatabaseHealth;
  abstract countDevices(staleBefore: Date): Promise<DeviceCounts>;
}
