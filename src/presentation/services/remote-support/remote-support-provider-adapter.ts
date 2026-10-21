import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";

export interface RemoteSupportDeviceResolutionResult {
  resolved: boolean;
  modulo?: ModuloEntity | null;
  reason?: string;
  targetIp?: string;
  candidates?: Array<{
    deviceId: string;
    name: string;
    ips: string[];
    groupId: string;
  }>;
}

export interface RemoteSupportSessionUrlResult {
  url: string;
  loginUrl: string;
  targetUrl: string;
  viewMode: number;
  expiresInSeconds: number;
  deviceId: string;
  deviceName: string;
}

export interface RemoteSupportProviderAdapter {
  resolveModuleDevice(
    moduleId: string,
  ): Promise<RemoteSupportDeviceResolutionResult>;
  createModuleSessionUrl(
    moduleId: string,
    viewModeInput?: unknown,
  ): Promise<RemoteSupportSessionUrlResult>;
}
