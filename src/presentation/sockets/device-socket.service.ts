import { Server as SocketServer, Socket } from "socket.io";
import { JwtPlugin } from "../../config/plugins/jwt.plugin";
import { ModuloService } from "../services/parking/modulo.service";
import { TicketRepository } from "../../domain/repository/parking/ticket.repository";
import { DeviceRuntimeAccessEventService } from "./device-runtime-access-event.service";
import { DeviceSessionRegistry } from "./device-session-registry";
import { DeviceSocketRegistrationService } from "./device-socket-registration.service";
import { DeviceSocketRuntimeService } from "./device-socket-runtime.service";
import {
  DeviceRuntimeAccessEventPayload,
  DeviceBindingUpdatedPayload,
  DeviceRegistrationEventPayload,
  OpenBarrierCommandPayload,
  OpenBarrierResponse,
} from "./device-socket.types";

export class DeviceSocketService {
  private readonly registrationService: DeviceSocketRegistrationService;
  private readonly runtimeService: DeviceSocketRuntimeService;
  private readonly runtimeAccessEventService: DeviceRuntimeAccessEventService;

  constructor(
    private readonly moduloService: ModuloService,
    private readonly registry: DeviceSessionRegistry,
    ticketRepository: TicketRepository,
  ) {
    this.registrationService = new DeviceSocketRegistrationService(
      this.moduloService,
      this.registry,
      this.getModuloIdFromToken.bind(this),
      this.getRemoteAddress.bind(this),
      this.normalizeFingerprint.bind(this),
    );
    this.runtimeService = new DeviceSocketRuntimeService(
      this.moduloService,
      this.registry,
    );
    this.runtimeAccessEventService = new DeviceRuntimeAccessEventService(
      ticketRepository,
    );
  }

  async getModuloIdFromToken(moduleToken: string): Promise<string> {
    const payload = await JwtPlugin.validateToken(moduleToken);

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid moduleToken");
    }

    const moduloId =
      "id" in payload
        ? String(payload.id)
        : "uid" in payload
          ? String(payload.uid)
          : "";

    if (!moduloId) {
      throw new Error("Invalid moduleToken");
    }

    return moduloId;
  }

  getRemoteAddress(socket: Socket): string {
    const forwardedFor = socket.handshake.headers["x-forwarded-for"];
    const candidate =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]
        : socket.handshake.address;

    return String(candidate ?? "").trim();
  }

  emitDeviceBindingUpdated(
    io: SocketServer | undefined,
    payload: DeviceBindingUpdatedPayload,
  ): void {
    this.runtimeService.emitDeviceBindingUpdated(io, payload);
  }

  async handleDeviceRegistration(
    socket: Socket,
    payload: DeviceRegistrationEventPayload,
    callback?: (response: OpenBarrierResponse) => void,
  ): Promise<void> {
    return this.registrationService.handleDeviceRegistration(
      socket,
      payload,
      callback,
    );
  }

  async handleDeviceHeartbeat(
    socket: Socket,
    payload: DeviceRegistrationEventPayload,
    callback?: (response: OpenBarrierResponse) => void,
  ): Promise<void> {
    return this.registrationService.handleDeviceHeartbeat(
      socket,
      payload,
      callback,
    );
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    return this.runtimeService.handleDisconnect(socket);
  }

  async openBarrier(
    io: SocketServer | undefined,
    moduloId: string,
    payload?: OpenBarrierCommandPayload,
  ): Promise<void> {
    return this.runtimeService.openBarrier(io, moduloId, payload);
  }

  async handleRuntimeAccessEvent(
    socket: Socket,
    payload: DeviceRuntimeAccessEventPayload,
    callback?: (response: OpenBarrierResponse) => void,
  ): Promise<void> {
    return this.runtimeAccessEventService.handleRuntimeAccessEvent(
      socket,
      payload,
      callback,
    );
  }

  async expireStaleSessions(io: SocketServer | undefined): Promise<void> {
    return this.runtimeService.expireStaleSessions(io);
  }

  private normalizeFingerprint(deviceFingerprint?: string): string {
    return String(deviceFingerprint ?? "").trim().toLowerCase();
  }
}
