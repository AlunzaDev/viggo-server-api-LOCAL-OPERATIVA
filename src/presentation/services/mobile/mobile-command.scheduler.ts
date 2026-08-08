import { MobileCommandService } from "./mobile-command.service";

export class MobileCommandScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private readonly service: MobileCommandService) {}

  start() {
    if (this.timer) return;
    const tick = () => void this.runOnce();
    this.timer = setInterval(tick, 2_000);
    setTimeout(tick, 1_000);
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
