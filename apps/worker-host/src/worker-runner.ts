import { HeartbeatEmitter } from './heartbeat-emitter';
import { normalizeResult } from './result-normalizer';

export class WorkerRunner {
  private readonly heartbeat = new HeartbeatEmitter(() => {
    process.stdout.write(`${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n`);
  });

  start(): void {
    this.heartbeat.start();
    const raw = process.argv[3] ?? process.argv[2];
    if (!raw) {
      process.stdout.write(`${JSON.stringify({ type: 'result', payload: normalizeResult({}) })}\n`);
      this.heartbeat.stop();
      return;
    }
    process.stdout.write(`${JSON.stringify({ type: 'result', payload: normalizeResult(JSON.parse(raw) as Record<string, unknown>) })}\n`);
    this.heartbeat.stop();
  }
}
