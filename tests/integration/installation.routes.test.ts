import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { envs } from "../../src/config";
import { JwtPlugin } from "../../src/config/plugins/jwt.plugin";
import { PostgresDatabase } from "../../src/data/postgres";
import { InstallationRoutes } from "../../src/presentation/routes/installation/installation.routes";
import { InstallationTokenCryptoService } from "../../src/presentation/services/installation/installation-token-crypto.service";

const db = () => PostgresDatabase.client;
const proyectoId = randomUUID();
let server: Server;
let baseUrl = "";
const original = { appEnv: envs.APP_ENV, projectId: envs.PROJECT_ID };
const profileId = randomUUID();
const staff: Record<"SUPER_ROLE" | "ADMIN_ROLE", { id: string; token: string }> = {
  SUPER_ROLE: { id: randomUUID(), token: "" },
  ADMIN_ROLE: { id: randomUUID(), token: "" },
};

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> };
};

const linkedRow = (encryptedSyncToken: string) =>
  db().localInstallation.create({
    data: {
      key: "default",
      installationId: "viggo-test-local-001",
      status: "linked",
      source: "env",
      proyectoId,
      proyectoNombre: "Plaza",
      encryptedSyncToken,
    },
  });

describe("installation routes", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 3 });
    const app = express();
    app.use(express.json());
    app.use("/api/installation", InstallationRoutes.routes);
    // Only the local server is real; the cloud is stubbed below.
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      if (url.includes("/installation-link/preview")) {
        return new Response(JSON.stringify({ proyecto: { id: proyectoId, nombre: "Plaza" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not stubbed" }), { status: 404 });
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await db().permissionProfile.create({ data: { id: profileId, app: "OPERATIVE_WEB", nombre: `reset-${profileId}` } });
    for (const [rol, user] of Object.entries(staff)) {
      await db().usuario.create({
        data: {
          id: user.id, nombre: "Staff", apellido: rol, correo: `${user.id}@viggo.test`, telefono: user.id.slice(0, 10),
          password: "hash", rol, emailValidated: true, allowedApps: ["OPERATIVE_WEB"],
          appPermissions: { create: { app: "OPERATIVE_WEB", permissionProfileId: profileId } },
        },
      });
      user.token = String(await JwtPlugin.generateToken({ id: user.id, app: "OPERATIVE_WEB" }));
    }
  });

  beforeEach(async () => {
    await db().localInstallation.deleteMany({});
  });

  afterEach(() => {
    envs.APP_ENV = original.appEnv;
    envs.PROJECT_ID = original.projectId;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise((resolve) => server.close(resolve));
    await db().localInstallation.deleteMany({});
    await db().usuario.deleteMany({ where: { id: { in: Object.values(staff).map((user) => user.id) } } });
    await db().permissionProfile.deleteMany({ where: { id: profileId } });
    await PostgresDatabase.disconnect();
  });

  it("flags an installation linked without cloud credentials and lets it link again without a session", async () => {
    await linkedRow("");
    const status = await call("GET", "/api/installation/status");
    expect(status.body.installation).toMatchObject({ configured: true, status: "linked", cloudCredentials: false });

    // Nobody can log in yet (users come from the cloud), so linking stays open.
    const preview = await call("POST", "/api/installation/link-preview", { installationLinkToken: "link-token" });
    expect(preview.status).toBe(200);
    expect(preview.body.proyecto).toMatchObject({ id: proyectoId });
  });

  it("requires a session once the installation holds its cloud token", async () => {
    await linkedRow(InstallationTokenCryptoService.encrypt("installation-token"));
    const status = await call("GET", "/api/installation/status");
    expect(status.body.installation).toMatchObject({ configured: true, cloudCredentials: true });

    expect((await call("POST", "/api/installation/link-preview", { installationLinkToken: "link-token" })).status).toBe(401);
    expect((await call("POST", "/api/installation/project-request", { installationLinkToken: "link-token" })).status).toBe(401);
  });

  it("links by PROJECT_ID only in development and tests", async () => {
    envs.PROJECT_ID = proyectoId;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      envs.APP_ENV = "prod";
      const ignored = await call("GET", "/api/installation/status");
      expect(ignored.body.installation).toMatchObject({ configured: false, status: "pending" });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("PROJECT_ID ignorado"));

      await db().localInstallation.deleteMany({});
      envs.APP_ENV = "test";
      const linked = await call("GET", "/api/installation/status");
      expect(linked.body.installation).toMatchObject({ configured: true, source: "env", cloudCredentials: false });
    } finally {
      warn.mockRestore();
    }
  });

  it("resets a linked installation only for Viggo staff, with confirmation and nothing left to send", async () => {
    await linkedRow(InstallationTokenCryptoService.encrypt("installation-token"));
    const installationId = "viggo-test-local-001";
    // Earlier tests may leave undelivered events: start from an empty queue.
    await db().outboxEvent.updateMany({ where: { sentAt: null }, data: { sentAt: new Date() } });

    expect((await call("POST", "/api/installation/reset", { installationId })).status).toBe(401);
    // Cashiers are ADMIN_ROLE too: they cannot unlink the parking.
    expect((await call("POST", "/api/installation/reset", { installationId }, staff.ADMIN_ROLE.token)).status).toBe(403);
    const wrongId = await call("POST", "/api/installation/reset", { installationId: "otra" }, staff.SUPER_ROLE.token);
    expect(wrongId).toMatchObject({ status: 400, body: { code: "INSTALLATION_ID_MISMATCH" } });

    // A local change not yet delivered to the cloud blocks the reset.
    const pending = await db().outboxEvent.create({
      data: { eventType: "ticket.created", aggregateType: "ticket", aggregateId: randomUUID(), payload: {} },
    });
    const blocked = await call("POST", "/api/installation/reset", { installationId }, staff.SUPER_ROLE.token);
    expect(blocked).toMatchObject({ status: 409, body: { code: "OUTBOX_PENDING", pending: 1 } });
    expect((await db().localInstallation.findUniqueOrThrow({ where: { key: "default" } })).status).toBe("linked");

    await db().outboxEvent.update({ where: { eventId: pending.eventId }, data: { sentAt: new Date() } });
    const reset = await call("POST", "/api/installation/reset", { installationId }, staff.SUPER_ROLE.token);
    expect(reset.status).toBe(200);
    expect(reset.body.installation).toMatchObject({ configured: false, status: "pending", proyectoId: null, installationId, cloudCredentials: false });
    const row = await db().localInstallation.findUniqueOrThrow({ where: { key: "default" } });
    expect(row).toMatchObject({ encryptedSyncToken: "", proyectoId: "", installationId });

    // Unlinked again: the linking screen works without a session.
    expect((await call("POST", "/api/installation/link-preview", { installationLinkToken: "link-token" })).status).toBe(200);
    await db().outboxEvent.delete({ where: { eventId: pending.eventId } });
  });
});
