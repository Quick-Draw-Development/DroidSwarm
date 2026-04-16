import type { ProjectMemorySummary } from '../lib/types';

export function ProjectMemoryPanel({ memory }: { memory: ProjectMemorySummary }) {
  return (
    <section>
      <h3>Project Memory</h3>
      <p>Facts: {memory.facts.length}</p>
      <p>Decisions: {memory.decisions.length}</p>
      <p>Checkpoints: {memory.checkpoints.length}</p>
    </section>
  );
}
