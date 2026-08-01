import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "..");
const tscBin = resolve(projectRoot, "node_modules", "typescript", "bin", "tsc");
const appEntry = resolve(projectRoot, "dist", "app.js");
const preferredPort = Number(process.env.PORT ?? 3000);
const fallbackPort = Number(
  process.env.OPERATIVO_FALLBACK_PORT ?? 3002,
);

process.stdout.write("\x1Bc");

if (!existsSync(tscBin)) {
  console.error("[DEV] TypeScript no esta instalado. Ejecuta `npm install` primero.");
  process.exit(1);
}

const runNode = (args, options = {}) =>
  spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });

const isPortReachable = (port, host) =>
  new Promise((resolvePort) => {
    const socket = net.createConnection({ port, host });

    const finish = (result) => {
      if (!socket.destroyed) socket.destroy();
      resolvePort(result);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });

const resolveRuntimePort = async () => {
  const occupied = await Promise.all([
    isPortReachable(preferredPort, "127.0.0.1"),
    isPortReachable(preferredPort, "::1"),
  ]);

  if (occupied.some(Boolean)) {
    console.log(
      `[OPERATIVO DEV] Port ${preferredPort} already responds on localhost. Using ${fallbackPort}.`,
    );
    return fallbackPort;
  }

  return preferredPort;
};

console.log("[DEV] Compilando el proyecto antes de iniciar...");
const initialBuild = spawnSync(process.execPath, [tscBin], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (initialBuild.error) {
  console.error("[DEV] No se pudo ejecutar TypeScript:", initialBuild.error);
  process.exit(1);
}

if (initialBuild.status !== 0) {
  console.error("[DEV] La compilacion inicial fallo.");
  process.exit(initialBuild.status ?? 1);
}

if (!existsSync(appEntry)) {
  console.error(`[DEV] No se genero el archivo esperado: ${appEntry}`);
  process.exit(1);
}

console.log("[DEV] Iniciando compilacion incremental y servidor con recarga...");

const runtimePort = await resolveRuntimePort();
const runtimeEnv = {
  ...process.env,
  PORT: String(runtimePort),
};

const compiler = runNode([tscBin, "--watch", "--preserveWatchOutput"]);
const server = runNode(["--watch", appEntry], { env: runtimeEnv });

let shuttingDown = false;

const shutdown = (signal = "SIGTERM", exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!compiler.killed) compiler.kill(signal);
  if (!server.killed) server.kill(signal);

  setTimeout(() => process.exit(exitCode), 100).unref();
};

compiler.on("error", (error) => {
  console.error("[DEV] Error en el compilador:", error);
  shutdown("SIGTERM", 1);
});

server.on("error", (error) => {
  console.error("[DEV] Error en el servidor:", error);
  shutdown("SIGTERM", 1);
});

server.on("exit", (code, signal) => {
  if (!shuttingDown && code !== 0) {
    console.error(
      `[DEV] El servidor termino inesperadamente (code=${code}, signal=${signal}).`,
    );
    shutdown("SIGTERM", code ?? 1);
  }
});

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));
