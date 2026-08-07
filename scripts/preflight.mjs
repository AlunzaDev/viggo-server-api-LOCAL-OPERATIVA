import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(scriptDirectory, "..");
const webDirectory = resolve(apiDirectory, "..", "viggo-web-OPERATIVA");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const allowedAdvisories = new Set([
  "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
]);
let failures = 0;

const heading = (message) => console.log(`\n==> ${message}`);
const pass = (message) => console.log(`[OK] ${message}`);
const warn = (message) => console.warn(`[WARN] ${message}`);
const fail = (message) => {
  failures += 1;
  console.error(`[FAIL] ${message}`);
};
const spawnNpm = (args, options) =>
  process.platform === "win32"
    ? spawnSync(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", [npmCommand, ...args].join(" ")],
        options,
      )
    : spawnSync(npmCommand, args, options);
const run = (label, cwd, args) => {
  heading(label);
  const result = spawnNpm(args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status === 0) pass(label);
  else fail(`${label} (salida ${result.status ?? "desconocida"})`);
};

const auditDependencies = (label, cwd) => {
  heading(label);
  const result = spawnNpm(["audit", "--omit=dev", "--json"], {
    cwd,
    encoding: "utf8",
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    fail(`${label}: informe JSON inválido`);
    return;
  }
  const ignored = new Set();
  const blocking = [];
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    const urls = (vulnerability.via ?? [])
      .filter((item) => typeof item === "object" && item !== null)
      .map((item) => item.url)
      .filter(Boolean);
    const dependencies = (vulnerability.via ?? []).filter(
      (item) => typeof item === "string",
    );
    const allowed =
      (urls.length > 0 && urls.every((url) => allowedAdvisories.has(url))) ||
      (urls.length === 0 &&
        dependencies.length > 0 &&
        dependencies.every((dependency) => ignored.has(dependency)));
    if (allowed) {
      ignored.add(name);
      warn(`${name}: aviso RSC aceptado temporalmente; Operativo es SPA`);
    } else if (["high", "critical"].includes(vulnerability.severity)) {
      blocking.push(`${name} (${vulnerability.severity})`);
    } else {
      warn(`${name} (${vulnerability.severity})`);
    }
  }
  if (blocking.length > 0) fail(`${label}: ${blocking.join(", ")}`);
  else pass(label);
};

const verifyTrackedSecrets = () => {
  heading("Archivos rastreados sin secretos evidentes");
  const repositories = [["api", apiDirectory], ["web", webDirectory]];
  const allowedPlaceholder =
    /change-me|replace-with|example|dummy|localhost|\$\{|MONGO_PASS/i;
  const findings = [];
  for (const [name, directory] of repositories) {
    let files;
    try {
      files = execFileSync("git", ["ls-files", "-z"], {
        cwd: directory,
        encoding: "utf8",
      }).split("\0").filter(Boolean);
    } catch {
      fail(`No fue posible revisar archivos de ${name}`);
      continue;
    }
    for (const file of files) {
      let content;
      try {
        content = readFileSync(resolve(directory, file), "utf8");
      } catch {
        continue;
      }
      for (const match of content.matchAll(/mongodb(?:\+srv)?:\/\/([^\s:@/]+):([^\s@/]+)@/gi)) {
        if (!allowedPlaceholder.test(match[2])) {
          findings.push(`${name}/${file}: URL MongoDB con contraseña embebida`);
        }
      }
    }
  }
  if (findings.length > 0) findings.forEach(fail);
  else pass("Archivos rastreados sin secretos evidentes");
};

const verifySecurityWiring = () => {
  heading("Rutas y configuración Operativa");
  const routes = readFileSync(
    resolve(apiDirectory, "src/presentation/routes/routes.ts"),
    "utf8",
  );
  const userRoutes = readFileSync(
    resolve(apiDirectory, "src/presentation/routes/auth/local-user.routes.ts"),
    "utf8",
  );
  const syncRoutes = readFileSync(
    resolve(apiDirectory, "src/presentation/routes/sync/sync.routes.ts"),
    "utf8",
  );
  const envConfig = readFileSync(
    resolve(apiDirectory, "src/config/plugins/envs.plugin.ts"),
    "utf8",
  );
  const localProjectScope = readFileSync(
    resolve(apiDirectory, "src/presentation/middlewares/local-project-scope.middleware.ts"),
    "utf8",
  );
  const authMiddleware = readFileSync(
    resolve(apiDirectory, "src/presentation/middlewares/auth.middleware.ts"),
    "utf8",
  );
  const checks = [
    ["Ruta local de usuarios montada", routes.includes('"/api/usuarios"')],
    ["Usuarios requieren autenticación", userRoutes.includes("AuthMiddleware.requireAuth")],
    ["Usuarios limitados a ADMIN/SUPER", userRoutes.includes("AUTH_ROLES.ADMIN") && userRoutes.includes("AUTH_ROLES.SUPER")],
    ["Usuarios sin métodos de escritura", !/router\.(post|put|patch|delete)\(/.test(userRoutes)],
    ["Sincronización protegida", /router\.use\(requireSyncAuth\)/.test(syncRoutes)],
    ["Secretos productivos validados", envConfig.includes("requireProductionSecret")],
    ["Dominio operativo limitado al proyecto local", routes.includes("requireLocalProject") && routes.includes('"/api/tickets", requireLocalProject')],
    ["IDs de otro proyecto rechazados", localProjectScope.includes("LOCAL_PROJECT_SCOPE_VIOLATION")],
    ["SUPER tambien limitado por la instalacion", authMiddleware.includes("!authRequest.localProjectId")],
  ];
  for (const [label, valid] of checks) valid ? pass(label) : fail(label);
};

console.log("Preflight Operativo (sin escrituras salvo artefactos de build)");
verifyTrackedSecrets();
verifySecurityWiring();
auditDependencies("Dependencias API de producción", apiDirectory);
auditDependencies("Dependencias Web de producción", webDirectory);
run("Compilación API", apiDirectory, ["run", "build"]);
run("Lint Web", webDirectory, ["run", "lint"]);
run("Compilación Web", webDirectory, ["run", "build"]);
run("Permisos, instalación, proyecto e índices (solo lectura)", apiDirectory, [
  "run",
  "audit:app-permissions",
]);

heading("Resultado");
if (failures > 0) {
  console.error(`Preflight RECHAZADO: ${failures} comprobación(es) fallaron.`);
  process.exitCode = 1;
} else {
  console.log("Preflight APROBADO.");
}
