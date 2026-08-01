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

export const envs = {
  APP_ENV: appEnv,
  PROD: isProd,
  JWT_SEED: env.get("JWT_SEED").default("").asString(),
  INSTALLATION_SECRET_KEY: env.get("INSTALLATION_SECRET_KEY").default("").asString(),
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
  ADMINISTRATIVO_API_URL: env
    .get("ADMINISTRATIVO_API_URL")
    .default("http://localhost:3000")
    .asString(),
  AUTH_COOKIE_NAME: env.get("AUTH_COOKIE_NAME").default("sikk_auth").asString(),
  AUTH_COOKIE_SECURE: authCookieSecure,
  AUTH_COOKIE_SAME_SITE: authCookieSameSite,
  AUTH_COOKIE_MAX_AGE_MS: env
    .get("AUTH_COOKIE_MAX_AGE_MS")
    .default(String(1000 * 60 * 60 * 24 * 2))
    .asIntPositive(),
  OFFLINE_LOGIN_MAX_AGE_DAYS: env
    .get("OFFLINE_LOGIN_MAX_AGE_DAYS")
    .default("7")
    .asIntPositive(),
  PAYMENT_CURRENCY: env.get("PAYMENT_CURRENCY").default("mxn").asString(),
  SYNC_SERVICE_TOKEN: env.get("SYNC_SERVICE_TOKEN").default("").asString(),
  AUTO_CONFIG_SYNC_ENABLED: env
    .get("AUTO_CONFIG_SYNC_ENABLED")
    .default("true")
    .asBool(),
  AUTO_CONFIG_SYNC_INTERVAL_MS: parseBoundedInteger(
    env.get("AUTO_CONFIG_SYNC_INTERVAL_MS").asString(),
    120000,
    15000,
    3600000,
  ),
  AUTO_CONFIG_SYNC_START_DELAY_MS: parseBoundedInteger(
    env.get("AUTO_CONFIG_SYNC_START_DELAY_MS").asString(),
    10000,
    0,
    600000,
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
