import type { RoutingDecisionSummary } from '../lib/types';

export function RoutingDecisionCard({ decisions }: { decisions: RoutingDecisionSummary[] }) {
  return (
    <section>
      <h3>Routing Decisions</h3>
      <ul>
        {decisions.map((decision) => (
          <li key={decision.attemptId}>
            {decision.role ?? 'worker'} → {decision.engine ?? 'unknown'} ({decision.complexity ?? 'n/a'})
          </li>
        ))}
      </ul>
    </section>
  );
}
