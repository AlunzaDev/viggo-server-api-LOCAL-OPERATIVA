import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { envs } from "../../../config";
import { ModuloEntity } from "../../../domain/entities/parking/modulo.entity";
import { ModuloRepository } from "../../../domain/repository/parking/modulo.repository";
import { ProyectoRepository } from "../../../domain/repository/parking/proyecto.repository";

const execFileAsync = promisify(execFile);

type MeshCentralDevice = Record<string, unknown>;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const stripNodePrefix = (value: string): string =>
  value.replace(/^(node|mesh)\/[^/]*\//, "").trim();

const buildMeshUrls = (baseUrl: string) => {
  const parsed = new URL(baseUrl);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.protocol = protocol;
  return parsed.toString().replace(/\/$/, "");
};

const readDeviceId = (device: MeshCentralDevice): string => {
  const raw =
    normalizeText(device._id) ||
    normalizeText(device.id) ||
    normalizeText(device.nodeid) ||
    normalizeText(device.nodeId);
  return stripNodePrefix(raw);
};

const readDeviceName = (device: MeshCentralDevice): string =>
  normalizeText(device.name) ||
  normalizeText(device.hostname) ||
  normalizeText(device.host) ||
  normalizeText(device.computerName);

const readDeviceGroupId = (device: MeshCentralDevice): string =>
  stripNodePrefix(
    normalizeText(device.meshid) ||
      normalizeText(device.meshId) ||
      normalizeText(device.groupid) ||
      normalizeText(device.groupId),
  );

const readDeviceIps = (device: MeshCentralDevice): string[] => {
  const candidates = [
    device.ip,
    device.ipAddress,
    device.address,
    device.host,
    ...(Array.isArray(device.ips) ? device.ips : []),
    ...(Array.isArray(device.netif)
      ? device.netif.flatMap((item) =>
          item && typeof item === "object"
            ? Object.values(item as Record<string, unknown>)
            : [],
        )
      : []),
  ];

  return candidates
    .map((item) => normalizeText(item))
    .filter((item) => /^\d{1,3}(\.\d{1,3}){3}$/.test(item));
};

const flattenDevices = (value: unknown): MeshCentralDevice[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenDevices(item));
  }

  if (!value || typeof value !== "object") return [];

  const source = value as Record<string, unknown>;
  const nested = ["devices", "nodes", "items"].flatMap((key) =>
    flattenDevices(source[key]),
  );
  const hasDeviceShape =
    readDeviceId(source) || readDeviceName(source) || readDeviceIps(source).length > 0;

  return hasDeviceShape ? [source, ...nested] : nested;
};

const buildUrls = (baseUrl: string, deviceId: string) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const encodedDeviceId = encodeURIComponent(deviceId);
  return {
    supportUrl: `${normalizedBaseUrl}/?viewmode=10&gotonode=${encodedDeviceId}`,
    desktopUrl: `${normalizedBaseUrl}/?viewmode=11&gotonode=${encodedDeviceId}`,
    terminalUrl: `${normalizedBaseUrl}/?viewmode=12&gotonode=${encodedDeviceId}`,
  };
};

const buildMeshCtrlCommand = (meshCtrlArgs: string[]) => {
  if (envs.MESHCENTRAL_MESHCTRL_MODE === "docker") {
    return {
      command: "docker",
      args: [
        "exec",
        envs.MESHCENTRAL_DOCKER_CONTAINER,
        "node",
        "/opt/meshcentral/meshcentral/meshctrl.js",
        ...meshCtrlArgs,
      ],
    };
  }

  return {
    command: envs.MESHCENTRAL_MESHCTRL_PATH || "meshctrl",
    args: meshCtrlArgs,
  };
};

export class MeshCentralDeviceResolverService {
  constructor(
    private readonly moduloRepository: ModuloRepository,
    private readonly proyectoRepository: ProyectoRepository,
  ) {}

  async resolveModuleDevice(moduleId: string) {
    const modulo = await this.moduloRepository.findById(moduleId);
    if (!modulo) {
      throw new Error("Modulo no encontrado");
    }

    const proyecto = await this.proyectoRepository.findById(modulo.proyecto);
    const projectSupport = proyecto?.remoteSupport ?? null;
    const moduleSupport = modulo.remoteSupport ?? null;
    const provider = moduleSupport?.provider || projectSupport?.provider || "MESHCENTRAL";
    if (provider !== "MESHCENTRAL") {
      throw new Error(`El proveedor '${provider}' no es compatible con MeshCentral`);
    }
    const baseUrl = normalizeText(projectSupport?.baseUrl || moduleSupport?.baseUrl);
    const groupId = normalizeText(projectSupport?.groupId || moduleSupport?.groupId);

    if (!baseUrl || !groupId) {
      throw new Error("El proyecto no tiene URL de soporte remoto o groupId configurado");
    }

    const devices = await this.listDevices(baseUrl);
    const targetIp = normalizeText(
      modulo.deviceRuntime?.ipAddress ||
        modulo.deviceConnectionAudit?.ipAddress ||
        modulo.deviceBindingRequests.find((request) => request.status === "APPROVED")
          ?.ipAddress,
    );
    const normalizedGroupId = stripNodePrefix(groupId);
    const candidates = devices.filter((device) => {
      const deviceGroupId = readDeviceGroupId(device);
      return !deviceGroupId || deviceGroupId === normalizedGroupId;
    });
    const matched =
      candidates.find((device) => readDeviceIps(device).includes(targetIp)) ||
      (candidates.length === 1 ? candidates[0] : null);

    if (!matched) {
      return {
        resolved: false,
        reason: "DEVICE_NOT_FOUND",
        targetIp,
        candidates: candidates.map((device) => ({
          deviceId: readDeviceId(device),
          name: readDeviceName(device),
          ips: readDeviceIps(device),
          groupId: readDeviceGroupId(device),
        })),
      };
    }

    const deviceId = readDeviceId(matched);
    if (!deviceId) {
      throw new Error("MeshCentral devolvio un device sin ID");
    }

    const urls = buildUrls(baseUrl, deviceId);
    const updatedRemoteSupport = {
      provider: "MESHCENTRAL" as const,
      enabled: true,
      deviceName: readDeviceName(matched) || modulo.nombre,
      deviceId,
      groupId,
      baseUrl,
      ...urls,
      linkedAt: new Date(),
      updatedAt: new Date(),
    };

    const updated = await this.moduloRepository.update(moduleId, {
      remoteSupport: updatedRemoteSupport,
    } as Partial<Omit<ModuloEntity, "id">>);

    return {
      resolved: true,
      modulo: updated,
      remoteSupport: updatedRemoteSupport,
      matchedDevice: {
        deviceId,
        name: readDeviceName(matched),
        ips: readDeviceIps(matched),
        groupId: readDeviceGroupId(matched),
      },
    };
  }

  private async listDevices(baseUrl: string): Promise<MeshCentralDevice[]> {
    if (!envs.MESHCENTRAL_LOGIN_USER) {
      throw new Error("MESHCENTRAL_LOGIN_USER no esta configurado");
    }
    if (!envs.MESHCENTRAL_LOGIN_PASS && !envs.MESHCENTRAL_LOGIN_KEY_FILE) {
      throw new Error("Configura MESHCENTRAL_LOGIN_PASS o MESHCENTRAL_LOGIN_KEY_FILE");
    }

    const meshCtrlArgs = [
      "listdevices",
      "--json",
      "--url",
      buildMeshUrls(baseUrl),
      "--loginuser",
      envs.MESHCENTRAL_LOGIN_USER,
    ];

    if (envs.MESHCENTRAL_LOGIN_KEY_FILE) {
      meshCtrlArgs.push("--loginkeyfile", envs.MESHCENTRAL_LOGIN_KEY_FILE);
    } else {
      meshCtrlArgs.push("--loginpass", envs.MESHCENTRAL_LOGIN_PASS);
    }

    if (envs.MESHCENTRAL_LOGIN_TOKEN) {
      meshCtrlArgs.push("--token", envs.MESHCENTRAL_LOGIN_TOKEN);
    }

    const { command, args } = buildMeshCtrlCommand(meshCtrlArgs);
    const { stdout } = await execFileAsync(command, args, {
      timeout: envs.MESHCENTRAL_COMMAND_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 5,
    });

    const parsed = JSON.parse(stdout);
    return flattenDevices(parsed);
  }
}
