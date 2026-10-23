import { envs } from "./config";
import { buildConfigSyncScheduler } from "./presentation/dependencies/config.dependencies";
import { buildMonthlyFlushScheduler } from "./presentation/dependencies/monthly-flush.dependencies";
import { AppRoutes } from "./presentation/routes/routes";
import { Server } from "./presentation/server";
import { buildMobileCommandScheduler } from "./presentation/dependencies/mobile.dependencies";
import { buildOutboxScheduler } from "./presentation/dependencies/outbox.dependencies";
import { HeartbeatSnapshotPublisher } from "./presentation/services/heartbeat/heartbeat-snapshot.publisher";
import { InstallationIdentityService } from "./presentation/services/installation/installation-identity.service";

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
const outboxScheduler = buildOutboxScheduler();
const server = new Server({
  host: envs.HOST,
  port: envs.PORT,
  publicPath: envs.PUBLIC_PATH,
  routes: AppRoutes.routes,
});

    await server.start();
    configSyncScheduler.start();
    mobileCommandScheduler.start();
    outboxScheduler.start();
    await monthlyFlushScheduler.start();
    // The linked project's module states reach ADMIN at least once a minute, even with no device activity.
    const credentials = await InstallationIdentityService.getCloudCredentials().catch(() => null);
    if (credentials) HeartbeatSnapshotPublisher.shared.watch(credentials.proyectoId);
    HeartbeatSnapshotPublisher.shared.start();
};

bootstrap().catch((error) => {
    console.error("[STARTUP ERROR]", error);
    process.exit(1);
});
