import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import mongoose from "mongoose";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const operativeDirectory = resolve(scriptDirectory, "..");
const administrativeDirectory = resolve(
  operativeDirectory,
  "..",
  "..",
  "ADMINISTRATIVO",
  "viggo-server-api-ADMINISTRATIVO",
);
const applyChanges = process.argv.includes("--apply");

const loadDatabaseConfig = (directory) => {
  const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
  const preferredPath = resolve(directory, `.env.${appEnv}`);
  const fallbackPath = resolve(directory, ".env");
  const filePath = existsSync(preferredPath) ? preferredPath : fallbackPath;
  if (!existsSync(filePath)) throw new Error(`No existe ${filePath}`);
  const values = parse(readFileSync(filePath));
  if (!values.MONGO_URL) throw new Error(`MONGO_URL no está definido en ${filePath}`);
  return {
    url: values.MONGO_URL,
    dbName: values.MONGO_DB_NAME,
  };
};

const administrativeConfig = loadDatabaseConfig(administrativeDirectory);
const operativeConfig = loadDatabaseConfig(operativeDirectory);
const administrative = await mongoose.createConnection(
  administrativeConfig.url,
  { dbName: administrativeConfig.dbName },
).asPromise();
const operative = await mongoose.createConnection(operativeConfig.url, {
  dbName: operativeConfig.dbName,
}).asPromise();

try {
  const centralProfiles = await administrative
    .collection("permissionprofiles")
    .find(
      { app: "OPERATIVE_WEB" },
      { projection: { app: 1, nombre: 1, descripcion: 1, modules: 1, estado: 1 } },
    )
    .toArray();
  const localProfiles = await operative
    .collection("permissionprofiles")
    .find(
      {},
      { projection: { app: 1, nombre: 1, descripcion: 1, modules: 1, estado: 1 } },
    )
    .toArray();
  const localUsers = await operative
    .collection("usuarios")
    .find(
      { allowedApps: "OPERATIVE_WEB" },
      {
        projection: {
          correo: 1,
          telefono: 1,
          rol: 1,
          allowedApps: 1,
          appPermissions: 1,
        },
      },
    )
    .toArray();

  if (centralProfiles.length === 0) {
    throw new Error("Administrativo no contiene perfiles OPERATIVE_WEB");
  }

  const plannedUsers = [];
  for (const localUser of localUsers) {
    const centralUser = await administrative.collection("usuarios").findOne(
      {
        $or: [
          { _id: localUser._id },
          { correo: localUser.correo },
          { telefono: localUser.telefono },
        ],
      },
      {
        projection: {
          rol: 1,
          allowedApps: 1,
          appPermissions: 1,
        },
      },
    );
    const assignment = centralUser?.appPermissions?.find(
      (permission) => permission?.app === "OPERATIVE_WEB",
    );
    if (!assignment?.permissionProfileId) {
      throw new Error(
        `El usuario ${localUser._id} no tiene asignación OPERATIVE_WEB en Administrativo`,
      );
    }
    if (
      !centralProfiles.some(
        (profile) => String(profile._id) === String(assignment.permissionProfileId),
      )
    ) {
      throw new Error(
        `El perfil ${assignment.permissionProfileId} asignado al usuario no existe`,
      );
    }
    plannedUsers.push({
      localUser,
      assignment: {
        app: "OPERATIVE_WEB",
        permissionProfileId: String(assignment.permissionProfileId),
      },
    });
  }

  const plan = {
    mode: applyChanges ? "apply" : "dry-run",
    sourceDatabase: administrativeConfig.dbName,
    targetDatabase: operativeConfig.dbName,
    profilesToUpsert: centralProfiles.map((profile) => ({
      id: String(profile._id),
      nombre: profile.nombre,
      modules: profile.modules,
      estado: profile.estado,
    })),
    usersToRepair: plannedUsers.map(({ localUser, assignment }) => ({
      id: String(localUser._id),
      role: localUser.rol,
      permissionProfileId: assignment.permissionProfileId,
    })),
    indexToEnsure: { app: 1, nombre: 1 },
  };
  console.log(JSON.stringify(plan, null, 2));

  if (!applyChanges) {
    console.log("Simulación completa. Usa --apply para aplicar este mismo plan.");
    process.exitCode = 0;
  } else {
    const backupDirectory = resolve(scriptDirectory, "backups");
    await mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = resolve(
      backupDirectory,
      `operative-access-${timestamp}.json`,
    );
    await writeFile(
      backupPath,
      JSON.stringify(
        {
          database: operativeConfig.dbName,
          createdAt: new Date().toISOString(),
          permissionProfiles: localProfiles,
          users: localUsers,
        },
        null,
        2,
      ),
      "utf8",
    );

    for (const profile of centralProfiles) {
      await operative.collection("permissionprofiles").updateOne(
        { _id: profile._id },
        {
          $set: {
            app: "OPERATIVE_WEB",
            nombre: profile.nombre,
            descripcion: profile.descripcion ?? "",
            modules: profile.modules ?? [],
            estado: profile.estado !== false,
          },
        },
        { upsert: true },
      );
    }

    for (const { localUser, assignment } of plannedUsers) {
      const retainedPermissions = (localUser.appPermissions ?? []).filter(
        (permission) => permission?.app !== "OPERATIVE_WEB",
      );
      await operative.collection("usuarios").updateOne(
        { _id: localUser._id },
        { $set: { appPermissions: [...retainedPermissions, assignment] } },
      );
    }

    await operative
      .collection("permissionprofiles")
      .createIndex({ app: 1, nombre: 1 }, { unique: true });

    console.log(`Reparación aplicada. Respaldo: ${backupPath}`);
  }
} finally {
  await Promise.all([administrative.close(), operative.close()]);
}
