import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import mongoose from "mongoose";

const appEnv = String(process.env.APP_ENV ?? "dev").trim().toLowerCase();
const envFile = resolve(process.cwd(), `.env.${appEnv}`);
loadDotenv(existsSync(envFile) ? { path: envFile } : undefined);

const mongoUrl = String(process.env.MONGO_URL ?? "").trim();
const dbName = String(process.env.MONGO_DB_NAME ?? "viggo-operativo").trim();

if (!mongoUrl) throw new Error("MONGO_URL is required for the read-only audit");

const OPERATIVE_MODULES = new Set([
  "cashPayments",
  "modules",
  "pensions",
  "pensionPasses",
  "tickets",
  "pensionMoves",
  "payments",
]);
const issues = [];
const addIssue = (severity, scope, id, code, details = {}) =>
  issues.push({ severity, scope, id: String(id), code, ...details });

try {
  await mongoose.connect(mongoUrl, { dbName });
  const usersCollection = mongoose.connection.collection("usuarios");
  const profilesCollection = mongoose.connection.collection("permissionprofiles");
  const installationsCollection = mongoose.connection.collection("localinstallations");
  const projectsCollection = mongoose.connection.collection("proyectos");
  const [users, profiles, userIndexes, profileIndexes, installations, projects] = await Promise.all([
    usersCollection.find({}).toArray(),
    profilesCollection.find({}).toArray(),
    usersCollection.indexes(),
    profilesCollection.indexes(),
    installationsCollection
      .find({}, { projection: { key: 1, installationId: 1, proyectoId: 1, status: 1 } })
      .toArray(),
    projectsCollection.find({}, { projection: { _id: 1 } }).toArray(),
  ]);
  const profilesById = new Map(
    profiles.map((profile) => [String(profile._id), profile]),
  );

  for (const profile of profiles) {
    const id = String(profile._id);
    if (profile.app !== "OPERATIVE_WEB") {
      addIssue("critical", "permissionProfile", id, "INVALID_LOCAL_APP", {
        app: profile.app,
      });
    }
    const modules = Array.isArray(profile.modules) ? profile.modules : [];
    const invalidModules = modules.filter(
      (module) => !OPERATIVE_MODULES.has(module),
    );
    if (invalidModules.length > 0) {
      addIssue("critical", "permissionProfile", id, "INVALID_MODULES", {
        modules: invalidModules,
      });
    }
  }

  for (const user of users) {
    const id = String(user._id);
    const allowedApps = Array.isArray(user.allowedApps) ? user.allowedApps : [];
    const permissions = Array.isArray(user.appPermissions)
      ? user.appPermissions
      : [];
    const role = String(user.rol ?? "").trim();
    const assignment = permissions.find(
      (permission) => permission?.app === "OPERATIVE_WEB",
    );

    if (allowedApps.includes("OPERATIVE_WEB") && !assignment) {
      addIssue("critical", "user", id, "OPERATIVE_WEB_WITHOUT_PROFILE");
      continue;
    }
    if (
      allowedApps.includes("OPERATIVE_WEB") &&
      role !== "ADMIN_ROLE" &&
      role !== "SUPER_ROLE"
    ) {
      addIssue("critical", "user", id, "ROLE_NOT_ALLOWED_FOR_OPERATIVE_WEB", {
        role,
      });
    }
    if (assignment) {
      const profileId = String(assignment.permissionProfileId ?? "").trim();
      const profile = profilesById.get(profileId);
      if (!profile) {
        addIssue("critical", "user", id, "MISSING_LOCAL_PROFILE", {
          profileId,
        });
      } else if (profile.app !== "OPERATIVE_WEB") {
        addIssue("critical", "user", id, "LOCAL_PROFILE_APP_MISMATCH", {
          profileId,
          profileApp: profile.app,
        });
      } else if (profile.estado !== true) {
        addIssue("warning", "user", id, "INACTIVE_LOCAL_PROFILE", {
          profileId,
        });
      }
    }
  }

  const expectedProfileIndex = profileIndexes.some(
    (index) => index.unique === true && index.key?.app === 1 && index.key?.nombre === 1,
  );
  if (!expectedProfileIndex) {
    addIssue("critical", "database", dbName, "MISSING_PROFILE_UNIQUE_INDEX");
  }

  if (installations.length !== 1) {
    addIssue("critical", "installation", dbName, "EXPECTED_SINGLE_INSTALLATION", {
      count: installations.length,
    });
  } else {
    const installation = installations[0];
    if (
      installation.key !== "default" ||
      installation.status !== "linked" ||
      !String(installation.proyectoId ?? "").trim()
    ) {
      addIssue("critical", "installation", installation._id, "INSTALLATION_NOT_LINKED");
    }
  }
  if (projects.length !== 1) {
    addIssue("critical", "database", dbName, "EXPECTED_SINGLE_LOCAL_PROJECT", {
      count: projects.length,
    });
  } else if (
    installations.length === 1 &&
    String(installations[0].proyectoId ?? "") !== String(projects[0]._id)
  ) {
    addIssue("critical", "installation", installations[0]._id, "LINKED_PROJECT_MISMATCH");
  }

  const summary = {
    readOnly: true,
    database: dbName,
    users: users.length,
    permissionProfiles: profiles.length,
    installations: installations.length,
    projects: projects.length,
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    indexes: {
      users: userIndexes.map((index) => ({ name: index.name, key: index.key, unique: index.unique === true })),
      permissionProfiles: profileIndexes.map((index) => ({ name: index.name, key: index.key, unique: index.unique === true })),
    },
    issues,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.critical > 0 ? 2 : 0;
} finally {
  await mongoose.disconnect();
}
