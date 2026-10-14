import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { ConfigSyncPostgresDatasource } from "../../src/infrastructure/datasources/config/config-sync.datasource.postgres";
import { ModuloPostgresDatasource } from "../../src/infrastructure/datasources/parking/modulo.datasource.postgres";
import { SyncPostgresDatasource } from "../../src/infrastructure/datasources/sync/sync.datasource.postgres";
import { PostgresTransactionRunner } from "../../src/infrastructure/datasources/system/transaction-runner.postgres";
import { ConfigSyncRepositoryImpl } from "../../src/infrastructure/repositories/config/config-sync.repository.impl";
import { SyncRepositoryImpl } from "../../src/infrastructure/repositories/sync/sync.repository.impl";
import { ConfigSyncService } from "../../src/presentation/services/config/config-sync.service";
import { InstallationIdentityService } from "../../src/presentation/services/installation/installation-identity.service";
import type { LocalInstallationService } from "../../src/presentation/services/installation/local-installation.service";
import { SyncService } from "../../src/presentation/services/sync/sync.service";

const sync = new SyncPostgresDatasource();
const configSync = new ConfigSyncPostgresDatasource();
const modulos = new ModuloPostgresDatasource();
const db = () => PostgresDatabase.client;

const validez = Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, from: [0, 0], to: [23, 59] }));

/** Documents in the shape ADMINISTRATIVO sends (see its sync.documents.postgres.ts). */
const buildSnapshot = () => {
  const proyectoId = randomUUID();
  const tag = proyectoId.slice(0, 8);
  const profileId = randomUUID();
  return {
    proyectoId,
    profileId,
    proyecto: {
      _id: proyectoId,
      nombre: "Plaza",
      coordinates: [-103.3, 20.6],
      ciudad: "GDL",
      direccion: "",
      identificador: `P-${tag}`,
      codigoProyecto: "0007",
      serverIp: "",
      serverMac: "",
      localApiBaseUrl: "",
      img: "",
      descripcion: "",
      estado: true,
    },
    modulos: [
      {
        _id: randomUUID(),
        nombre: "Entrada",
        proyecto: proyectoId,
        tipo: "ENTRADA",
        estado: true,
        identificador: `E-${tag}`,
        coordinates: [],
        submodulos: [{ submoduloId: "qr", nombre: "Lector", tipo: "QR_SCANNER", estado: true }],
      },
    ],
    pensionId: randomUUID(),
    passId: randomUUID(),
    passCreated: Date.now(),
    users: [] as Record<string, unknown>[],
    permissionProfiles: [] as Record<string, unknown>[],
  };
};

type Snapshot = ReturnType<typeof buildSnapshot>;

const configuration = (snapshot: Snapshot, overrides: Record<string, unknown> = {}) => ({
  proyecto: snapshot.proyecto,
  modulos: snapshot.modulos,
  pensiones: [
    { _id: snapshot.pensionId, proyecto: snapshot.proyectoId, nombre: "Mensual", validez, precio: 1500, descripcion: "", estado: true },
  ],
  pensionPasses: [
    {
      _id: snapshot.passId,
      name: "Pase",
      pension: snapshot.pensionId,
      idPass: `PASS-${snapshot.passId}`,
      vigent: true,
      created: snapshot.passCreated,
      from: -1,
      to: -1,
      estado: true,
      antiPassback: true,
    },
  ],
  ...overrides,
});

const access = (snapshot: Snapshot) => {
  const cashier = {
    _id: randomUUID(),
    nombre: "Ana",
    apellido: "Cajera",
    correo: `ana.${snapshot.proyectoId}@viggo.test`,
    telefono: snapshot.proyectoId.slice(0, 10),
    coordinates: [],
    password: "$2a$10$hash",
    emailValidated: true,
    rol: "ADMIN_ROLE",
    parkings: [snapshot.proyectoId],
    allowedApps: ["OPERATIVE_WEB", "ADMIN_WEB"],
    appPermissions: [
      { app: "OPERATIVE_WEB", permissionProfileId: snapshot.profileId },
      { app: "ADMIN_WEB", permissionProfileId: randomUUID() },
    ],
    img: "",
    estado: true,
    google: false,
  };
  // Mobile-only user: not stored here.
  const client = { ...cashier, _id: randomUUID(), allowedApps: ["OPERATIVE_MOBILE"], appPermissions: [] };
  snapshot.users.push(cashier, client);
  const profile = { _id: snapshot.profileId, app: "OPERATIVE_WEB", nombre: `Cajero ${snapshot.proyectoId}`, descripcion: "", modules: ["tickets"], estado: true };
  snapshot.permissionProfiles.push(profile);
  return { users: [cashier, client], permissionProfiles: [profile] };
};

const created: Snapshot[] = [];
const newSnapshot = () => {
  const snapshot = buildSnapshot();
  created.push(snapshot);
  return snapshot;
};

describe("sync datasources (Postgres)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 3 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    for (const snapshot of created) {
      const proyectoId = snapshot.proyectoId;
      await db().pensionPass.deleteMany({ where: { pension: { proyectoId } } });
      await db().pension.deleteMany({ where: { proyectoId } });
      await db().modulo.deleteMany({ where: { proyectoId } });
      await db().proyecto.deleteMany({ where: { id: proyectoId } });
      await db().usuario.deleteMany({ where: { id: { in: snapshot.users.map((user) => String(user._id)) } } });
      await db().permissionProfile.deleteMany({ where: { id: snapshot.profileId } });
      await db().configSyncAudit.deleteMany({ where: { proyectoId } });
    }
    await PostgresDatabase.disconnect();
  });

  it("creates the projections, then reports them unchanged", async () => {
    const snapshot = newSnapshot();
    const first = await sync.applyConfigurationSnapshot(configuration(snapshot));
    expect(first.details.proyecto).toEqual({ received: 1, created: 1, updated: 0, unchanged: 0 });
    expect(first.details.pensionPasses.created).toBe(1);

    const second = await sync.applyConfigurationSnapshot(configuration(snapshot));
    expect(second.details.modulos).toEqual({ received: 1, created: 0, updated: 0, unchanged: 1 });
    expect(second.details.pensiones.unchanged).toBe(1);
    expect(second.details.pensionPasses.unchanged).toBe(1);
  });

  it("updates cloud fields without touching local state", async () => {
    const snapshot = newSnapshot();
    await sync.applyConfigurationSnapshot(configuration(snapshot));
    const moduloId = String(snapshot.modulos[0]._id);
    const boundAt = new Date();
    await modulos.update(moduloId, { deviceBinding: { fingerprint: "fp", boundAt, lastSeenAt: boundAt } });
    await db().pensionPass.update({ where: { id: snapshot.passId }, data: { inParking: true } });

    snapshot.modulos[0].nombre = "Entrada principal";
    const result = await sync.applyConfigurationSnapshot(configuration(snapshot));
    expect(result.details.modulos.updated).toBe(1);

    const modulo = await modulos.findById(moduloId);
    expect(modulo?.nombre).toBe("Entrada principal");
    expect(modulo?.deviceBinding?.fingerprint).toBe("fp");
    expect((await db().pensionPass.findUniqueOrThrow({ where: { id: snapshot.passId } })).inParking).toBe(true);
  });

  it("applies a snapshot atomically: a bad reference keeps nothing", async () => {
    const snapshot = newSnapshot();
    const broken = configuration(snapshot, {
      pensionPasses: [{ ...configuration(snapshot).pensionPasses[0], pension: randomUUID() }],
    });
    await expect(sync.applyConfigurationSnapshot(broken)).rejects.toMatchObject({ code: "SYNC_INVALID_REFERENCE" });
    expect(await db().proyecto.count({ where: { id: snapshot.proyectoId } })).toBe(0);
  });

  it("rejects ids that are not UUIDs", async () => {
    const snapshot = newSnapshot();
    const legacy = configuration(snapshot, { proyecto: { ...snapshot.proyecto, _id: "64b7f0c2a1b2c3d4e5f60718" } });
    await expect(sync.applyConfigurationSnapshot(legacy)).rejects.toMatchObject({ code: "SYNC_INVALID_ID" });
  });

  it("stores only users and profiles of the operative web app", async () => {
    const snapshot = newSnapshot();
    const result = await sync.applyAccessSnapshot(access(snapshot));
    expect(result.users).toBe(1);
    expect(result.details.permissionProfiles.created).toBe(1);

    const cashier = await db().usuario.findUniqueOrThrow({
      where: { id: String(snapshot.users[0]._id) },
      include: { appPermissions: true },
    });
    expect(cashier.allowedApps).toEqual(["OPERATIVE_WEB"]);
    expect(cashier.appPermissions.map((permission) => permission.app)).toEqual(["OPERATIVE_WEB"]);
    expect(await db().usuario.count({ where: { id: String(snapshot.users[1]._id) } })).toBe(0);

    await sync.applyConfigurationSnapshot(configuration(snapshot));
    const integrity = await configSync.getIntegritySnapshot(snapshot.proyectoId);
    expect(integrity.proyectoExists).toBe(true);
    expect(integrity.usuarios).toContainEqual({ id: cashier.id, operativeProfileId: snapshot.profileId });
    expect(await configSync.findExistingPermissionProfileIds([snapshot.profileId, "x"], "OPERATIVE_WEB")).toEqual([
      snapshot.profileId,
    ]);
  });

  describe("ConfigSyncService.syncNow", () => {
    const buildService = (snapshot: Snapshot) => {
      const installation = { status: "linked", proyectoId: snapshot.proyectoId, proyectoNombre: "Plaza", installationId: "viggo-test-local-001" };
      const installations = {
        findDefault: async () => installation,
        upsertRequest: async () => installation,
        updateSyncState: async () => installation,
      } as unknown as LocalInstallationService;
      InstallationIdentityService.configure(installations);
      return new ConfigSyncService(
        installations,
        new SyncService(new SyncRepositoryImpl(sync)),
        new ConfigSyncRepositoryImpl(configSync),
        new PostgresTransactionRunner({ timeoutMs: 60_000 }),
      );
    };

    const stubCloud = (configurationBody: object, accessBody: object) =>
      vi.stubGlobal("fetch", async (url: string) => {
        const body = url.includes("/configuration/") ? configurationBody : accessBody;
        return new Response(JSON.stringify({ version: Date.now(), ...body }), { status: 200 });
      });

    it("applies configuration and access together and records the audit", async () => {
      const snapshot = newSnapshot();
      stubCloud(configuration(snapshot), access(snapshot));
      const result = await buildService(snapshot).syncNow({ triggerSource: "system" });

      expect(result.integrity.errors).toEqual([]);
      expect(result.integrity.counts).toMatchObject({ proyecto: 1, modulos: 1, submodulos: 1, pensiones: 1, pensionPasses: 1, usuarios: 1 });
      const audit = await db().configSyncAudit.findFirstOrThrow({ where: { proyectoId: snapshot.proyectoId } });
      expect(audit.status).toBe("success");
      expect(audit.counts).toMatchObject({ proyecto: 1, users: 1 });
    });

    it("rolls everything back when the result is inconsistent", async () => {
      const snapshot = newSnapshot();
      const sixDays = configuration(snapshot);
      sixDays.pensiones[0].validez = validez.slice(0, 6);
      stubCloud(sixDays, access(snapshot));

      await expect(buildService(snapshot).syncNow()).rejects.toMatchObject({ code: "SYNC_INTEGRITY_FAILED" });
      expect(await db().proyecto.count({ where: { id: snapshot.proyectoId } })).toBe(0);
      expect(await db().usuario.count({ where: { id: String(snapshot.users[0]._id) } })).toBe(0);
      const audit = await db().configSyncAudit.findFirstOrThrow({ where: { proyectoId: snapshot.proyectoId } });
      expect(audit.status).toBe("failed");
      expect(audit.errorCode).toBe("SYNC_INTEGRITY_FAILED");
    });
  });
});
