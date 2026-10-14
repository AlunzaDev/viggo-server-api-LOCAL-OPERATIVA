import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests read their own env file so they can never point at the dev or prod database.
const testEnv = existsSync(".env.test") ? parse(readFileSync(".env.test")) : {};
// The app config (envs.plugin) requires these; tests never use real secrets or MongoDB.
const appDefaults = {
  APP_ENV: "test",
  PORT: "3999",
  PUBLIC_PATH: "public",
  JWT_SEED: "test-jwt-seed-not-a-real-secret-0000",
  MONGO_URL: "mongodb://127.0.0.1:1/unused_test",
};
// globalSetup runs in this process, `test.env` only reaches the workers.
Object.assign(process.env, appDefaults, testEnv);

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { ...appDefaults, ...testEnv },
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/app-env.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
