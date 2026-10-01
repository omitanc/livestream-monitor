// One in-flight task, no queue. A hung task prevents overlap but emits a timeout.
export class Sampler {
  private timer?: ReturnType<typeof setTimeout>;
  private timeout?: ReturnType<typeof setTimeout>;
  private active = false;
  private busy = false;
  constructor(
    private task: () => Promise<void>,
    private failed: () => void,
    private interval = 1000,
  ) {}
  start() {
    if (this.active) return;
    this.active = true;
    void this.run();
  }
  stop() {
    this.active = false;
    clearTimeout(this.timer);
    clearTimeout(this.timeout);
  }
  private async run() {
    if (!this.active || this.busy) return;
    this.busy = true;
    this.timeout = setTimeout(() => {
      if (this.active) this.failed();
    }, 8000);
    try {
      await this.task();
    } catch {
      if (this.active) this.failed();
    } finally {
      clearTimeout(this.timeout);
      this.busy = false;
      if (this.active) this.timer = setTimeout(() => void this.run(), this.interval);
    }
  }
}
