import type { RoutingDecisionSummary } from '../lib/types';

export function RoutingDecisionCard({ decisions }: { decisions: RoutingDecisionSummary[] }) {
  return (
    <section>
      <h3>Routing Decisions</h3>
      <ul>
        {decisions.map((decision) => (
          <li key={decision.attemptId}>
            {decision.role ?? 'worker'} → {decision.engine ?? 'unknown'} [{decision.modelTier ?? 'unassigned'}]
            {' '}({decision.routeKind ?? decision.complexity ?? 'n/a'}, queue {decision.queueDepth ?? 0}, fallback {decision.fallbackCount ?? 0})
            {decision.escalationReason ? ` · ${decision.escalationReason}` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
