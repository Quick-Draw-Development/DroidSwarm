import type { RepoSummary } from '../lib/types';

export function RepoBadge({ repo }: { repo: RepoSummary }) {
  return <span>{repo.name} · {repo.defaultBranch}</span>;
}
