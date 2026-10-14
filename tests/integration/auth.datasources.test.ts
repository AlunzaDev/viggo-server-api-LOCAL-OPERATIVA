import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { UsuarioEntity } from "../../src/domain/entities/auth/usuario.entity";
import { PermissionProfileEntity } from "../../src/domain/entities/auth/permission-profile.entity";
import { AuthPostgresDatasource } from "../../src/infrastructure/datasources/auth/auth.datasource.postgres";
import { PermissionProfilePostgresDatasource } from "../../src/infrastructure/datasources/auth/permission-profile.datasource.postgres";

const auth = new AuthPostgresDatasource();
const profiles = new PermissionProfilePostgresDatasource();
const tag = randomUUID().slice(0, 8);
const userIds: string[] = [];
const profileIds: string[] = [];

const cloudUser = (overrides: Record<string, unknown> = {}) => {
  const id = randomUUID();
  userIds.push(id);
  return UsuarioEntity.fromObject({
    id,
    nombre: "Ana",
    apellido: `Cajera ${tag}`,
    correo: `ana.${id}@viggo.test`,
    telefono: `33${id.slice(0, 8)}`,
    password: "$2a$10$hash",
    emailValidated: true,
    rol: "ADMIN_ROLE",
    parkings: [randomUUID()],
    allowedApps: ["OPERATIVE_WEB"],
    appPermissions: [{ app: "OPERATIVE_WEB", permissionProfileId: randomUUID() }],
    estado: true,
    google: false,
    barrierBlasterHighScore: 0,
    ...overrides,
  });
};

describe("auth datasources (Postgres)", () => {
  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 2 });
  });

  afterAll(async () => {
    await PostgresDatabase.client.usuario.deleteMany({ where: { id: { in: userIds } } });
    await PostgresDatabase.client.permissionProfile.deleteMany({ where: { id: { in: profileIds } } });
    await PostgresDatabase.disconnect();
  });

  it("stores a cloud user with its permissions and sync metadata", async () => {
    const user = cloudUser({ correo: `Mixed.${tag}@Viggo.Test`, nacimiento: Date.UTC(1990, 4, 1) });
    const saved = await auth.upsertFromAdministrativo(user);

    expect(saved.correo).toBe(`mixed.${tag}@viggo.test`);
    expect(saved.appPermissions).toEqual(user.appPermissions);
    expect(saved.parkings).toEqual(user.parkings);
    expect(saved.nacimiento).toBe(Date.UTC(1990, 4, 1));

    const metadata = await auth.getSyncMetadataById(user.id);
    expect(metadata?.syncSource).toBe("administrativo");
    expect(metadata?.lastSyncedAt).toBeGreaterThan(Date.now() - 60_000);

    expect((await auth.findByCorreo(`MIXED.${tag}@viggo.test`))?.id).toBe(user.id);
    expect((await auth.findByTelefono(user.telefono))?.id).toBe(user.id);
  });

  it("only raises the high score and keeps it when the cloud copy is saved again", async () => {
    const user = cloudUser();
    await auth.upsertFromAdministrativo(user);

    expect((await auth.updateBarrierBlasterHighScore(user.id, 50))?.barrierBlasterHighScore).toBe(50);
    expect((await auth.updateBarrierBlasterHighScore(user.id, 10))?.barrierBlasterHighScore).toBe(50);

    const renamed = UsuarioEntity.fromObject({ ...user, nombre: "Ana Maria", barrierBlasterHighScore: 0 });
    const saved = await auth.upsertFromAdministrativo(renamed);
    expect(saved.nombre).toBe("Ana Maria");
    expect(saved.barrierBlasterHighScore).toBe(50);
  });

  it("replaces the app permissions on each save", async () => {
    const user = cloudUser();
    await auth.upsert(user);
    const newProfile = randomUUID();
    const saved = await auth.upsert(
      UsuarioEntity.fromObject({ ...user, appPermissions: [{ app: "OPERATIVE_WEB", permissionProfileId: newProfile }] }),
    );
    expect(saved.appPermissions).toEqual([{ app: "OPERATIVE_WEB", permissionProfileId: newProfile }]);
  });

  it("lists users with search and paging", async () => {
    await Promise.all([cloudUser({ nombre: "Beto" }), cloudUser({ nombre: "Carla" })].map((user) => auth.upsert(user)));
    const page = await auth.listLocalUsers({ page: 1, limit: 2, search: `cajera ${tag}` });
    expect(page.total).toBeGreaterThanOrEqual(4);
    expect(page.usuarios).toHaveLength(2);
    expect(page.usuarios[0].apellido).toBe(`Cajera ${tag}`);
    expect(page.usuarios[0]).not.toHaveProperty("password");
  });

  it("treats ids that are not UUIDs as not found", async () => {
    expect(await auth.findById("64b7f0c2a1b2c3d4e5f60718")).toBeNull();
    expect(await auth.getSyncMetadataById("nope")).toBeNull();
    expect(await profiles.findById("nope")).toBeNull();
  });

  it("upserts permission profiles synced from the cloud", async () => {
    const id = randomUUID();
    profileIds.push(id);
    const profile = PermissionProfileEntity.fromObject({
      id,
      app: "OPERATIVE_WEB",
      nombre: `Cajero ${tag}`,
      modules: ["tickets", "cashPayments"],
      estado: true,
    });
    await profiles.upsert(profile);
    const updated = await profiles.upsert(PermissionProfileEntity.fromObject({ ...profile, modules: ["tickets"] }));
    expect(updated.modules).toEqual(["tickets"]);
    expect((await profiles.findById(id))?.nombre).toBe(`Cajero ${tag}`);
  });
});
