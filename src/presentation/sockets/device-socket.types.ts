export interface OpenBarrierResponse {
  ok?: boolean;
  error?: string;
  code?: string;
  deviceSecret?: string;
}

export interface RuntimeAccessTrackingPayload {
  kind: "ticket";
  ticketId: string;
  moduleId: string;
  mode?: "entrada" | "salida";
}

export interface OpenBarrierCommandPayload {
  msg?: string;
  accessTracking?: RuntimeAccessTrackingPayload;
}

export type DeviceRuntimeAccessEventName =
  | "barrier_opened"
  | "vehicle_passed"
  | "vehicle_timeout";

export interface DeviceRuntimeAccessEventPayload
  extends RuntimeAccessTrackingPayload {
  event: DeviceRuntimeAccessEventName;
  occurredAt: number;
}

export interface DeviceIdentityPayload {
  cpu_serial?: string;
  machine_id?: string;
  primary_mac?: string;
  location_label?: string;
}

export interface AuthorizedDeviceConnection {
  socketId: string;
  fingerprint: string;
}

export type DeviceConnectionStatus = "APPROVED" | "PENDING" | "REJECTED";

export type DeviceRuntimeConnectionStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "PENDING"
  | "REJECTED"
  | "MISMATCH";

export interface DeviceConnectionSession {
  socketId: string;
  moduloId: string;
  fingerprint: string;
  status: DeviceConnectionStatus;
  connectedAt: Date;
  lastSeenAt: Date;
}

export interface DeviceBindingUpdatedPayload {
  moduleId: string;
  fingerprint?: string;
  status: "APPROVED" | "REJECTED" | "PENDING" | "RESET";
  reason: string;
  timestamp: string;
}

export interface DeviceRegistrationEventPayload {
  moduleToken?: string;
  moduleId?: string;
  deviceFingerprint?: string;
  deviceIdentity?: DeviceIdentityPayload;
  deviceSecret?: string;
}

export const DEVICE_HEARTBEAT_INTERVAL_MS = 20000;
export const DEVICE_HEARTBEAT_TIMEOUT_MS = 45000;
export const STALE_SESSION_SCAN_INTERVAL_MS = 15000;
