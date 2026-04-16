export class HeartbeatEmitter {
  private timer?: NodeJS.Timeout;

  constructor(private readonly onTick?: () => void, private readonly intervalMs = 5_000) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      this.onTick?.();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
