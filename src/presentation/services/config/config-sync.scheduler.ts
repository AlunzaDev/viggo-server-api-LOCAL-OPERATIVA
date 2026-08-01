import { envs } from "../../../config";
import { ConfigSyncService } from "./config-sync.service";

export class ConfigSyncScheduler {
  private intervalHandle: NodeJS.Timeout | null = null;
  private startupHandle: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly configSyncService: ConfigSyncService) {}

  start() {
    if (!envs.AUTO_CONFIG_SYNC_ENABLED) {
      console.info("[OPERATIVO sync] Automatic sync is disabled");
      return;
    }

    if (this.startupHandle || this.intervalHandle) return;

    const runAutomaticSync = () => {
      void this.runOnce();
    };

    const startupDelay = envs.AUTO_CONFIG_SYNC_START_DELAY_MS;
    this.startupHandle = setTimeout(() => {
      this.startupHandle = null;
      runAutomaticSync();
    }, startupDelay);

    this.intervalHandle = setInterval(
      runAutomaticSync,
      envs.AUTO_CONFIG_SYNC_INTERVAL_MS,
    );

    console.info(
      `[OPERATIVO sync] Automatic sync enabled. Interval=${envs.AUTO_CONFIG_SYNC_INTERVAL_MS}ms startDelay=${startupDelay}ms`,
    );
  }

  stop() {
    if (this.startupHandle) {
      clearTimeout(this.startupHandle);
      this.startupHandle = null;
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async runOnce() {
    if (this.running) {
      console.info("[OPERATIVO sync] Previous automatic sync still running; skipping this tick");
      return;
    }

    this.running = true;

    try {
      const status = await this.configSyncService.getStatus();

      if (!status.configured || !status.proyectoId) {
        console.info("[OPERATIVO sync] Automatic sync skipped because installation is not linked yet");
        return;
      }

      const result = await this.configSyncService.syncNow({
        triggerSource: "automatic",
      });

      console.info("[OPERATIVO sync] Automatic sync applied", {
        proyectoId: status.proyectoId,
        configurationVersion: result.configurationVersion,
        accessVersion: result.accessVersion,
        syncedAt: result.syncedAt,
      });
    } catch (error) {
      console.error("[OPERATIVO sync] Automatic sync failed", error);
    } finally {
      this.running = false;
    }
  }
}
