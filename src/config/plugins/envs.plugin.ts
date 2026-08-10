import { config as loadDotenv } from "dotenv";
import * as env from "env-var";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const appEnv = (process.env.APP_ENV ?? "dev").trim().toLowerCase();
const envFilePath = resolve(process.cwd(), `.env.${appEnv}`);

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
} else {
  loadDotenv();
}

const getConfigValue = (key: string) => process.env[key];
const isProd = appEnv === "prod" || env.get("PROD").default("false").asBool();
const webServiceUrl = getConfigValue("WEB_SERVICE_URL") ?? "";
const rawWebClientUrl = getConfigValue("WEB_CLIENT_URL");
const webClientUrl =
  typeof rawWebClientUrl === "string" && rawWebClientUrl.trim().length > 0
    ? rawWebClientUrl
    : webServiceUrl;
const corsAllowedOrigins = [
  webClientUrl,
  webServiceUrl,
  ...(getConfigValue("CORS_ALLOWED_ORIGINS") ?? "").split(","),
]
  .map((value) => String(value).trim())
  .filter(Boolean);
const mongoUrl = getConfigValue("MONGO_URL") ?? "";

if (!mongoUrl) {
  throw new Error("MONGO_URL is required.");
}

const parseBoundedInteger = (
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0)
    return fallback;

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid integer value "${rawValue}" for range ${min}-${max}`,
    );
  }

  return parsed;
};

const parseSameSite = (
  rawValue: string | undefined,
  fallback: "lax" | "strict" | "none",
): "lax" | "strict" | "none" => {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0)
    return fallback;

  const normalized = rawValue.trim().toLowerCase();
  if (
    normalized === "lax" ||
    normalized === "strict" ||
    normalized === "none"
  ) {
    return normalized;
  }

  throw new Error(`Invalid AUTH_COOKIE_SAME_SITE value "${rawValue}"`);
};

const authCookieSecure = env
  .get("AUTH_COOKIE_SECURE")
  .default(isProd ? "true" : "false")
  .asBool();
const authCookieSameSite = parseSameSite(
  env.get("AUTH_COOKIE_SAME_SITE").asString(),
  isProd ? "none" : "lax",
);
const jwtSeed = env.get("JWT_SEED").required().asString().trim();
const installationSecretKey = env
  .get("INSTALLATION_SECRET_KEY")
  .default("")
  .asString()
  .trim();
const syncServiceToken = env.get("SYNC_SERVICE_TOKEN").default("").asString().trim();
const administrativoApiUrl = env
  .get("ADMINISTRATIVO_API_URL")
  .default("http://localhost:3000")
  .asString()
  .trim()
  .replace(/\/$/, "");

for (const origin of corsAllowedOrigins) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid CORS origin: ${origin}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error(`CORS origin must be an exact HTTP(S) origin without a path: ${origin}`);
  }
}

try {
  const administrativoUrl = new URL(administrativoApiUrl);
  if (!["http:", "https:"].includes(administrativoUrl.protocol)) {
    throw new Error();
  }
} catch {
  throw new Error("ADMINISTRATIVO_API_URL must be a valid HTTP(S) URL.");
}

if (authCookieSameSite === "none" && !authCookieSecure) {
  throw new Error("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE=none.");
}

if (isProd) {
  const requireProductionSecret = (name: string, value: string): void => {
    if (value.length < 32) {
      throw new Error(`${name} must contain at least 32 characters in production.`);
    }
  };
  if (corsAllowedOrigins.length === 0) {
    throw new Error("CORS_ALLOWED_ORIGINS or WEB_CLIENT_URL is required in production.");
  }
  if (!authCookieSecure) {
    throw new Error("AUTH_COOKIE_SECURE must be true in production.");
  }
  requireProductionSecret("JWT_SEED", jwtSeed);
  requireProductionSecret("INSTALLATION_SECRET_KEY", installationSecretKey);
  requireProductionSecret("SYNC_SERVICE_TOKEN", syncServiceToken);
}

export const envs = {
  APP_ENV: appEnv,
  PROD: isProd,
  JWT_SEED: jwtSeed,
  INSTALLATION_SECRET_KEY: installationSecretKey,
  MONGO_URL: mongoUrl,
  MONGO_DB_NAME: getConfigValue("MONGO_DB_NAME") ?? "cobro-cajas-wm",
  MONGO_DISCONNECT_EXIT_DELAY_MS: parseBoundedInteger(
    env.get("MONGO_DISCONNECT_EXIT_DELAY_MS").asString(),
    30000,
    1000,
    300000,
  ),
  HOST: env.get("HOST").default("0.0.0.0").asString(),
  PORT: env.get("PORT").required().asPortNumber() ?? 8080,
  PUBLIC_PATH: env.get("PUBLIC_PATH").required().asString() ?? "public",

  WEB_SERVICE_URL: webServiceUrl,
  WEB_CLIENT_URL: webClientUrl,
  CORS_ALLOWED_ORIGINS: [...new Set(corsAllowedOrigins)],
  PROJECT_ID: env.get("PROJECT_ID").default("").asString(),
  INSTALLATION_ID: env.get("INSTALLATION_ID").default("").asString(),
  ADMINISTRATIVO_API_URL: administrativoApiUrl,
  AUTH_COOKIE_NAME: env.get("AUTH_COOKIE_NAME").default("sikk_auth").asString(),
  AUTH_COOKIE_SECURE: authCookieSecure,
  AUTH_COOKIE_SAME_SITE: authCookieSameSite,
  AUTH_COOKIE_MAX_AGE_MS: env
    .get("AUTH_COOKIE_MAX_AGE_MS")
    .default(String(1000 * 60 * 60 * 24 * 2))
    .asIntPositive(),
  OFFLINE_LOGIN_MAX_AGE_DAYS: parseBoundedInteger(
    env.get("OFFLINE_LOGIN_MAX_AGE_DAYS").asString(),
    7,
    1,
    30,
  ),
  PAYMENT_CURRENCY: env.get("PAYMENT_CURRENCY").default("mxn").asString(),
  SYNC_SERVICE_TOKEN: syncServiceToken,
  AUTO_CONFIG_SYNC_ENABLED: env
    .get("AUTO_CONFIG_SYNC_ENABLED")
    .default("true")
    .asBool(),
  AUTO_CONFIG_SYNC_INTERVAL_MS: parseBoundedInteger(
    env.get("AUTO_CONFIG_SYNC_INTERVAL_MS").asString(),
    120000,
    15000,
    86400000,
  ),
  AUTO_CONFIG_SYNC_START_DELAY_MS: parseBoundedInteger(
    env.get("AUTO_CONFIG_SYNC_START_DELAY_MS").asString(),
    10000,
    0,
    600000,
  ),
  MOBILE_COMMANDS_SYNC_ENABLED: env
    .get("MOBILE_COMMANDS_SYNC_ENABLED")
    .default("false")
    .asBool(),
  MOBILE_COMMANDS_SYNC_INTERVAL_MS: parseBoundedInteger(
    env.get("MOBILE_COMMANDS_SYNC_INTERVAL_MS").asString(),
    15000,
    2000,
    300000,
  ),
  MOBILE_COMMANDS_SYNC_START_DELAY_MS: parseBoundedInteger(
    env.get("MOBILE_COMMANDS_SYNC_START_DELAY_MS").asString(),
    5000,
    0,
    300000,
  ),
  MONTHLY_FLUSH_SCHEDULER_INTERVAL_MS: parseBoundedInteger(
    env.get("MONTHLY_FLUSH_SCHEDULER_INTERVAL_MS").asString(),
    300000,
    60000,
    3600000,
  ),
  BARRIER_SOCKET_REQUIRED: env
    .get("BARRIER_SOCKET_REQUIRED")
    .default(isProd ? "true" : "false")
    .asBool(),
  BARRIER_SOCKET_TIMEOUT_MS: env
    .get("BARRIER_SOCKET_TIMEOUT_MS")
    .default("5000")
    .asIntPositive(),
};
