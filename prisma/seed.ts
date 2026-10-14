// Development seed: `npm run db:seed`. Idempotent (fixed ids), refuses to run in prod.
//
// Loads a demo parking the same way ADMINISTRATIVO's sync would (the configuration and access
// snapshots go through SyncPostgresDatasource) and links this installation to it, so the API
// works without the cloud. With ADMINISTRATIVO running, link the installation and sync instead.
import { hashSync } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PostgresDatabase } from "../src/data/postgres";
import { LocalInstallationPostgresDatasource } from "../src/infrastructure/datasources/installation/local-installation.datasource.postgres";
import { SyncPostgresDatasource } from "../src/infrastructure/datasources/sync/sync.datasource.postgres";

const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
if (appEnv === "prod") {
  throw new Error("The seed must not run against production.");
}
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true });

// Fixed ids so re-running updates the same rows.
const IDS = {
  proyecto: "0190f5a0-0000-7000-8000-000000000001",
  entrada: "0190f5a0-0000-7000-8000-000000000011",
  salida: "0190f5a0-0000-7000-8000-000000000012",
  cajero: "0190f5a0-0000-7000-8000-000000000013",
  pension: "0190f5a0-0000-7000-8000-000000000021",
  profile: "0190f5a0-0000-7000-8000-000000000031",
  admin: "0190f5a0-0000-7000-8000-000000000041",
  cajera: "0190f5a0-0000-7000-8000-000000000042",
  pass: (index: number) => `0190f5a0-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`,
};

const generated: string[] = [];
const password = (envName: string, label: string) => {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const value = randomBytes(9).toString("base64url");
  generated.push(`${label}: ${value}`);
  return value;
};

const submodulo = (submoduloId: string, nombre: string, tipo: string) => ({ submoduloId, nombre, tipo, estado: true });
const modulo = (_id: string, identificador: string, nombre: string, tipo: string, submodulos: unknown[]) => ({
  _id,
  nombre,
  proyecto: IDS.proyecto,
  tipo,
  estado: true,
  identificador,
  coordinates: [],
  submodulos,
});

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  await PostgresDatabase.connect({ databaseUrl });
  const sync = new SyncPostgresDatasource();
  const now = Date.now();

  const configuration = await sync.applyConfigurationSnapshot({
    proyecto: {
      _id: IDS.proyecto,
      nombre: "Demo Centro",
      coordinates: [-103.3496, 20.6767],
      ciudad: "Guadalajara",
      direccion: "Av. Juárez 100",
      identificador: "demo-centro",
      codigoProyecto: "0001",
      estado: true,
    },
    modulos: [
      modulo(IDS.entrada, "demo-centro-entrada", "Entrada principal", "ENTRADA", [
        submodulo("QR-ENT", "Lector QR", "QR_SCANNER"),
        submodulo("PLUMA-ENT", "Pluma", "BARRIER"),
        submodulo("IMP-ENT", "Impresora", "PRINTER"),
      ]),
      modulo(IDS.salida, "demo-centro-salida", "Salida principal", "SALIDA", [
        submodulo("QR-SAL", "Lector QR", "QR_SCANNER"),
        submodulo("PLUMA-SAL", "Pluma", "BARRIER"),
      ]),
      modulo(IDS.cajero, "demo-centro-cajero", "Cajero automático", "POS", [
        submodulo("MONEDERO", "Aceptador de efectivo", "CASH_ACCEPTOR"),
        submodulo("PANTALLA", "Pantalla", "DISPLAY"),
      ]),
    ],
    pensiones: [
      {
        _id: IDS.pension,
        proyecto: IDS.proyecto,
        nombre: "Pensión mensual",
        validez: Array.from({ length: 7 }, (_, weekDay) => ({ weekDay, from: [0, 0], to: [23, 59] })),
        precio: 1500,
        estado: true,
      },
    ],
    pensionPasses: [1, 2, 3].map((index) => ({
      _id: IDS.pass(index),
      name: `Pase ${index}`,
      pension: IDS.pension,
      idPass: `DEMO-PM-${String(index).padStart(3, "0")}`,
      vigent: false,
      antiPassback: true,
      created: now,
      from: -1,
      to: -1,
      estado: true,
    })),
  });

  // Users keep their password across runs: only new users get one.
  const existing = new Set(
    (await PostgresDatabase.client.usuario.findMany({ where: { id: { in: [IDS.admin, IDS.cajera] } }, select: { id: true } })).map(
      (user) => user.id,
    ),
  );
  const storedPassword = async (id: string) =>
    (await PostgresDatabase.client.usuario.findUniqueOrThrow({ where: { id }, select: { password: true } })).password;
  const user = async (id: string, data: { nombre: string; apellido: string; correo: string; telefono: string; rol: string }, envName: string) => ({
    _id: id,
    ...data,
    password: existing.has(id) ? await storedPassword(id) : hashSync(password(envName, data.correo), 10),
    emailValidated: true,
    parkings: [IDS.proyecto],
    allowedApps: ["OPERATIVE_WEB"],
    appPermissions: [{ app: "OPERATIVE_WEB", permissionProfileId: IDS.profile }],
    estado: true,
    google: false,
  });

  const access = await sync.applyAccessSnapshot({
    permissionProfiles: [
      {
        _id: IDS.profile,
        app: "OPERATIVE_WEB",
        nombre: "Operación completa",
        modules: ["cashPayments", "modules", "pensions", "pensionPasses", "tickets", "pensionMoves", "payments"],
        estado: true,
      },
    ],
    users: [
      await user(
        IDS.admin,
        { nombre: "Super", apellido: "Admin", correo: process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@viggo.local", telefono: "0000000000", rol: "SUPER_ROLE" },
        "SEED_ADMIN_PASSWORD",
      ),
      await user(
        IDS.cajera,
        { nombre: "Caja", apellido: "Centro", correo: "cajero@viggo.local", telefono: "0000000001", rol: "ADMIN_ROLE" },
        "SEED_USER_PASSWORD",
      ),
    ],
  });

  await new LocalInstallationPostgresDatasource().linkProject({
    proyectoId: IDS.proyecto,
    proyectoNombre: "Demo Centro",
    proyectoIdentificador: "demo-centro",
    source: "env",
    cloudRequestId: "",
  });

  console.log(
    `[SEED] Demo Centro (0001): ${configuration.modulos} modulos, ${configuration.pensionPasses} pases; ` +
      `${access.details.users.created} usuarios nuevos, ${access.details.users.updated + access.details.users.unchanged} existentes`,
  );
  console.log("[SEED] Instalacion vinculada a Demo Centro");
  if (generated.length) {
    console.log("[SEED] Contraseñas generadas (no se volverán a mostrar):");
    generated.forEach((line) => console.log(`  ${line}`));
  }
};

main()
  .catch((error) => {
    console.error("[SEED] Failed", error);
    process.exitCode = 1;
  })
  .finally(() => PostgresDatabase.disconnect());
