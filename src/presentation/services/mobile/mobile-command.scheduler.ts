import { envs } from "../../../config";
import { MobileCommandService } from "./mobile-command.service";

export class MobileCommandScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private readonly service: MobileCommandService) {}

  start() {
    if (!envs.MOBILE_COMMANDS_SYNC_ENABLED) {
      console.info("[OPERATIVO mobile-commands] Polling disabled");
      return;
    }
    if (this.timer) return;
    const tick = () => void this.runOnce();
    this.timer = setInterval(tick, envs.MOBILE_COMMANDS_SYNC_INTERVAL_MS);
    setTimeout(tick, envs.MOBILE_COMMANDS_SYNC_START_DELAY_MS);
    console.info(
      `[OPERATIVO mobile-commands] Polling enabled. Interval=${envs.MOBILE_COMMANDS_SYNC_INTERVAL_MS}ms startDelay=${envs.MOBILE_COMMANDS_SYNC_START_DELAY_MS}ms`,
    );
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      for (let count = 0; count < 10; count += 1) {
        if (!(await this.service.processNext())) break;
      }
    } catch (error) {
      console.error("[OPERATIVO mobile-commands] Poll failed", error);
    } finally {
      this.running = false;
    }
  }
}
