import { envs } from "./config";
import { buildConfigSyncScheduler } from "./presentation/dependencies/config.dependencies";
import { buildMonthlyFlushScheduler } from "./presentation/dependencies/monthly-flush.dependencies";
import { AppRoutes } from "./presentation/routes/routes";
import { Server } from "./presentation/server";
import { buildMobileCommandScheduler } from "./presentation/dependencies/mobile.dependencies";

process.on("unhandledRejection", (reason) => {
    console.error("[UNHANDLED REJECTION]", reason);
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.error("[UNCAUGHT EXCEPTION]", error);
    process.exit(1);
});

const bootstrap = async () => {
const configSyncScheduler = buildConfigSyncScheduler();
const monthlyFlushScheduler = buildMonthlyFlushScheduler();
const mobileCommandScheduler = buildMobileCommandScheduler();
const server = new Server({
  host: envs.HOST,
  port: envs.PORT,
  publicPath: envs.PUBLIC_PATH,
  routes: AppRoutes.routes,
});

    await server.start();
    configSyncScheduler.start();
    mobileCommandScheduler.start();
    await monthlyFlushScheduler.start();
};

bootstrap().catch((error) => {
    console.error("[STARTUP ERROR]", error);
    process.exit(1);
});
