import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/data/postgres";
import { ModuloPostgresDatasource } from "../../src/infrastructure/datasources/parking/modulo.datasource.postgres";
import { ProyectoPostgresDatasource } from "../../src/infrastructure/datasources/parking/proyecto.datasource.postgres";
import { PensionPassPostgresDatasource } from "../../src/infrastructure/datasources/pension/pension-pass.datasource.postgres";
import { PensionPostgresDatasource } from "../../src/infrastructure/datasources/pension/pension.datasource.postgres";

const proyectos = new ProyectoPostgresDatasource();
const modulos = new ModuloPostgresDatasource();
const pensiones = new PensionPostgresDatasource();
const passes = new PensionPassPostgresDatasource();
const tag = randomUUID().slice(0, 8);

const validez = Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, from: [7, 30], to: [22, 0] }));

describe("parking and pension datasources (Postgres)", () => {
  let proyectoId = "";

  beforeAll(async () => {
    await PostgresDatabase.connect({ databaseUrl: process.env.DATABASE_URL!, poolMax: 2 });
    const proyecto = await proyectos.create({
      nombre: "Plaza",
      coordinates: [-103.3, 20.6],
      ciudad: "GDL",
      identificador: `P-${tag}`,
      codigoProyecto: "0042",
      remoteSupport: { provider: "MESHCENTRAL", enabled: true, baseUrl: "https://mesh.test" },
      estado: true,
    });
    proyectoId = proyecto.id;
  });

  afterAll(async () => {
    const db = PostgresDatabase.client;
    const pensionIds = (await db.pension.findMany({ where: { proyectoId }, select: { id: true } })).map((p) => p.id);
    await db.pensionPass.deleteMany({ where: { pensionId: { in: pensionIds } } });
    await db.pension.deleteMany({ where: { proyectoId } });
    await db.modulo.deleteMany({ where: { proyectoId } });
    await db.proyecto.deleteMany({ where: { id: proyectoId } });
    await PostgresDatabase.disconnect();
  });

  it("reads the project with its remote support", async () => {
    const proyecto = await proyectos.findById(proyectoId);
    expect(proyecto?.codigoProyecto).toBe("0042");
    expect(proyecto?.coordinates).toEqual([-103.3, 20.6]);
    expect(proyecto?.remoteSupport).toEqual({ provider: "MESHCENTRAL", enabled: true, baseUrl: "https://mesh.test", groupId: undefined });
    expect((await proyectos.findByIdentificador(`P-${tag}`))?.id).toBe(proyectoId);
  });

  it("keeps ordered sub-modules and the device state of a module", async () => {
    const modulo = await modulos.create({
      nombre: "Entrada",
      proyecto: proyectoId,
      tipo: "ENTRADA",
      estado: true,
      identificador: `E-${tag}`,
      coordinates: [-103.31, 20.61],
      submodulos: [
        { submoduloId: "qr", nombre: "Lector", tipo: "QR_SCANNER", estado: true },
        { submoduloId: "barrera", nombre: "Pluma", tipo: "BARRIER", estado: true },
      ],
    });
    expect(modulo.submodulos.map((submodulo) => submodulo.submoduloId)).toEqual(["qr", "barrera"]);
    expect(modulo.coordinates).toEqual([-103.31, 20.61]);

    const requestedAt = new Date("2026-10-01T10:00:00Z");
    await modulos.update(modulo.id, {
      deviceBindingRequests: [{ fingerprint: "fp-1", status: "PENDING", requestedAt }],
      deviceRuntime: { connectionStatus: "PENDING", isConnected: true, isAuthorized: false, lastHeartbeatAt: requestedAt },
    });
    expect((await modulos.getWithPendingDeviceBindingRequests()).map((item) => item.id)).toContain(modulo.id);

    const boundAt = new Date("2026-10-01T10:05:00Z");
    const bound = await modulos.update(modulo.id, {
      deviceBinding: { fingerprint: "fp-1", boundAt, lastSeenAt: boundAt },
      deviceBindingRequests: [{ fingerprint: "fp-1", status: "APPROVED", requestedAt, resolvedAt: boundAt }],
    });
    expect(bound?.deviceBinding?.fingerprint).toBe("fp-1");
    expect(bound?.deviceBindingRequests).toHaveLength(1);
    expect(bound?.deviceBindingRequests[0].status).toBe("APPROVED");
    // Keys not sent are left alone.
    expect(bound?.deviceRuntime?.lastHeartbeatAt).toEqual(requestedAt);
    expect(bound?.submodulos).toHaveLength(2);

    const cleared = await modulos.update(modulo.id, { deviceRuntime: null });
    expect(cleared?.deviceRuntime).toBeNull();
    expect((await modulos.resetDeviceBinding(modulo.id))?.deviceBinding).toBeNull();

    expect(await modulos.getFiltered({ proyecto: proyectoId, tipos: ["ENTRADA"], estado: true })).toHaveLength(1);
    expect(await modulos.getFiltered({ proyecto: "not-a-uuid" })).toEqual([]);
    expect(await modulos.findById("not-a-uuid")).toBeNull();
  });

  it("stores the weekly validity of a pension and contract dates of its passes", async () => {
    const pension = await pensiones.create({ proyecto: proyectoId, nombre: "Mensual", validez, precio: 1500.5, estado: true });
    expect(pension.precio).toBe(1500.5);
    expect(pension.validez[0]).toEqual({ weekDay: 0, from: [7, 30], to: [22, 0] });

    const free = await passes.create({
      name: "Pase 1",
      pension: pension.id,
      idPass: `PASS-${tag}`,
      vigent: false,
      antiPassback: true,
      inParking: false,
      created: Date.now(),
      from: -1,
      to: -1,
      estado: true,
    });
    expect(free.from).toBe(-1);
    expect((await passes.findAvailableByPension(pension.id))?.id).toBe(free.id);

    const usuarioId = randomUUID();
    const from = Date.UTC(2026, 9, 1);
    const contracted = await passes.update(free.id, { usuario: usuarioId, vigent: true, from, to: from + 30 * 86_400_000 });
    expect(contracted?.from).toBe(from);
    expect(await passes.findAvailableByPension(pension.id)).toBeNull();
    expect((await passes.findByUsuarioAndPension(usuarioId, pension.id))?.id).toBe(free.id);
    expect((await passes.findByIdPass(`PASS-${tag}`))?.usuario).toBe(usuarioId);

    const inside = await passes.update(free.id, { inParking: true });
    expect(inside?.inParking).toBe(true);
    expect(inside?.vigent).toBe(true);
  });

  it("refuses to delete a project that still has modules", async () => {
    await expect(proyectos.delete(proyectoId)).rejects.toThrow("El proyecto tiene modulos");
  });
});
