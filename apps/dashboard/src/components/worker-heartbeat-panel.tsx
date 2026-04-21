import type { WorkerHeartbeatSummary } from '../lib/types';

export function WorkerHeartbeatPanel({ heartbeats }: { heartbeats: WorkerHeartbeatSummary[] }) {
  return (
    <section>
      <h3>Worker Heartbeats</h3>
      <ul>
        {heartbeats.map((heartbeat) => (
          <li key={`${heartbeat.attemptId}-${heartbeat.createdAt}`}>
            {heartbeat.engine} [{heartbeat.modelTier ?? 'unassigned'}] · {heartbeat.status} · {heartbeat.elapsedMs}ms · queue {heartbeat.queueDepth ?? 0} · fallback {heartbeat.fallbackCount ?? 0}
          </li>
        ))}
      </ul>
    </section>
  );
}
