import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { chooseBackendDecision } from '@model-router';
import { runConsensusRound } from '@shared-governance';
import { type CodeReviewRunRecord, resolveProjectLookup, upsertCodeReviewRun } from '@shared-projects';
import { appendAuditEvent } from '@shared-tracing';

export type ReviewFindingCategory = 'blocking' | 'important' | 'nice-to-have' | 'question';
export type ReviewFindingKind =
  | 'pr-description'
  | 'bug'
  | 'tests'
  | 'security'
  | 'performance'
  | 'quality'
  | 'pattern';

export interface ReviewFinding {
  kind: ReviewFindingKind;
  category: ReviewFindingCategory;
  title: string;
  summary: string;
  filePath?: string;
  line?: number;
  risk?: 'low' | 'medium' | 'high';
  problematicSnippet?: string;
  fixExample?: string;
  benefit?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  lineNumber?: number;
  content: string;
}

interface DiffFile {
  filePath: string;
  addedLines: number;
  removedLines: number;
  lines: DiffLine[];
}

export interface CodeReviewResult {
  reviewId: string;
  projectId: string;
  prId: string;
  title: string;
  status: CodeReviewRunRecord['status'];
  summary: string;
  findings: ReviewFinding[];
  findingsMarkdown: string;
  consensusId?: string;
  auditHash?: string;
  backend: string;
  repoRoot: string;
  baseRef: string;
  headRef: string;
}

const runGit = (repoRoot: string, ...args: string[]): string =>
  execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const tryGit = (repoRoot: string, ...args: string[]): string | undefined => {
  try {
    return runGit(repoRoot, ...args);
  } catch {
    return undefined;
  }
};

const resolveProjectContext = (input?: { project?: string; repoRoot?: string }): { projectId: string; repoRoot: string } => {
  if (input?.project) {
    const project = resolveProjectLookup(input.project);
    if (!project) {
      throw new Error(`Unknown project: ${input.project}`);
    }
    return { projectId: project.projectId, repoRoot: project.rootPath };
  }
  const repoRoot = path.resolve(input?.repoRoot ?? process.cwd());
  const project = resolveProjectLookup(repoRoot);
  return {
    projectId: project?.projectId ?? process.env.DROIDSWARM_PROJECT_ID ?? path.basename(repoRoot),
    repoRoot,
  };
};

const resolveHeadRef = (repoRoot: string, prId: string): string =>
  tryGit(repoRoot, 'rev-parse', '--verify', prId) ? prId : 'HEAD';

const resolveBaseRef = (repoRoot: string, headRef: string): string => {
  for (const candidate of ['origin/develop', 'origin/main', 'develop', 'main']) {
    if (tryGit(repoRoot, 'rev-parse', '--verify', candidate)) {
      const mergeBase = tryGit(repoRoot, 'merge-base', candidate, headRef);
      if (mergeBase) {
        return mergeBase;
      }
    }
  }
  return tryGit(repoRoot, 'rev-parse', `${headRef}^`) ?? headRef;
};

const parseUnifiedDiff = (diff: string): DiffFile[] => {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let nextAddedLine = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) {
        files.push(current);
      }
      current = undefined;
      continue;
    }
    if (line.startsWith('+++ b/')) {
      current = {
        filePath: line.slice('+++ b/'.length),
        addedLines: 0,
        removedLines: 0,
        lines: [],
      };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith('@@')) {
      const match = line.match(/\+(\d+)(?:,\d+)?/);
      nextAddedLine = match ? Number.parseInt(match[1], 10) : 0;
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.addedLines += 1;
      current.lines.push({ type: 'added', lineNumber: nextAddedLine, content: line.slice(1) });
      nextAddedLine += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      current.removedLines += 1;
      current.lines.push({ type: 'removed', content: line.slice(1) });
      continue;
    }
    current.lines.push({ type: 'context', lineNumber: nextAddedLine, content: line.startsWith(' ') ? line.slice(1) : line });
    nextAddedLine += 1;
  }

  if (current) {
    files.push(current);
  }
  return files.filter((file) => file.filePath !== '/dev/null');
};

const readFileIfPresent = (repoRoot: string, filePath: string): string => {
  try {
    return fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8');
  } catch {
    return '';
  }
};

const issueWithSuggestion = (input: Omit<ReviewFinding, 'fixExample' | 'benefit'> & { fixExample: string; benefit: string }): ReviewFinding => ({
  ...input,
  fixExample: input.fixExample,
  benefit: input.benefit,
});

export const validatePRDescription = (_diff: DiffFile[], prBody: string): ReviewFinding[] => {
  const trimmed = prBody.trim();
  const findings: ReviewFinding[] = [];
  if (trimmed.length < 24) {
    findings.push(issueWithSuggestion({
      kind: 'pr-description',
      category: 'important',
      title: 'PR description is too thin',
      summary: 'The review body should explain the behavioral change, risk, and validation plan before code review proceeds.',
      problematicSnippet: trimmed || '(empty description)',
      fixExample: '## Summary\nDescribe the user-visible change.\n\n## Test plan\n- npm test\n\n## Risks\n- None',
      benefit: 'Reviewers can validate intent, coverage, and rollout risk without inferring context from the diff.',
    }));
  }
  if (!/test/i.test(trimmed)) {
    findings.push(issueWithSuggestion({
      kind: 'pr-description',
      category: 'important',
      title: 'PR description is missing a test plan',
      summary: 'There is no explicit validation section describing how the change was checked.',
      problematicSnippet: trimmed || '(empty description)',
      fixExample: '## Test plan\n- npx nx test shared-skills\n- Manual smoke: run DroidSwarm review run feature/code-review-agent',
      benefit: 'A concrete test plan makes regressions and unverified changes obvious during review.',
    }));
  }
  if (!/risk|breaking|impact/i.test(trimmed)) {
    findings.push(issueWithSuggestion({
      kind: 'pr-description',
      category: 'question',
      title: 'PR description does not discuss risk or breaking change impact',
      summary: 'The diff may be safe, but the PR body should still state risk level or confirm there are no breaking changes.',
      problematicSnippet: trimmed || '(empty description)',
      fixExample: '## Risks\n- Low risk. No schema changes or user-facing breakage.\n\n## Breaking changes\n- None',
      benefit: 'Explicit impact notes help reviewers focus on the highest-risk files first.',
    }));
  }
  return findings;
};

export const analyzeCodeChanges = (files: DiffFile[]): ReviewFinding[] => {
  const findings: ReviewFinding[] = [];
  for (const file of files) {
    for (const line of file.lines.filter((entry) => entry.type === 'added')) {
      const content = line.content;
      if (/==[^=]|!=[^=]/.test(content) && !/null/.test(content)) {
        findings.push(issueWithSuggestion({
          kind: 'bug',
          category: 'important',
          title: 'Loose equality in changed code',
          summary: 'Loose equality can hide type coercion bugs and make review outcomes dependent on runtime shape.',
          filePath: file.filePath,
          line: line.lineNumber,
          problematicSnippet: content,
          fixExample: content.replace(/==/g, '===').replace(/!=/g, '!=='),
          benefit: 'Strict comparisons reduce coercion bugs and make the intent of the branch easier to reason about.',
        }));
      }
      if (/\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/.test(content)) {
        findings.push(issueWithSuggestion({
          kind: 'bug',
          category: 'blocking',
          title: 'Potential infinite loop introduced',
          summary: 'The changed code adds an unconditional loop without visible termination logic.',
          filePath: file.filePath,
          line: line.lineNumber,
          problematicSnippet: content,
          fixExample: `${content}\n// Add a bounded exit condition or explicit break tied to a verified state change.`,
          benefit: 'A visible exit path reduces the chance of runaway workers or blocked review automation.',
        }));
      }
      if (/\bawait\b/.test(content) && !/\btry\b|\bcatch\b/.test(file.lines.map((entry) => entry.content).join('\n'))) {
        findings.push(issueWithSuggestion({
          kind: 'bug',
          category: 'important',
          title: 'Async path lacks obvious error handling',
          summary: 'The changed file now awaits work, but the surrounding change does not show an error path or failure summary.',
          filePath: file.filePath,
          line: line.lineNumber,
          problematicSnippet: content,
          fixExample: `try {\n  ${content.trim()}\n} catch (error) {\n  // surface a typed failure summary here\n}`,
          benefit: 'Explicit async failure handling keeps task state and review output deterministic.',
        }));
      }
    }
  }
  return findings;
};

export const checkTestCoverage = (files: DiffFile[], repoRoot: string): ReviewFinding[] => {
  const findings: ReviewFinding[] = [];
  const changedTests = new Set(
    files
      .map((file) => file.filePath)
      .filter((filePath) => /\.(spec|test)\.[jt]sx?$/.test(filePath)),
  );
  for (const file of files) {
    if (/\.(spec|test)\.[jt]sx?$/.test(file.filePath) || !/\.[jt]sx?$/.test(file.filePath)) {
      continue;
    }
    const basename = file.filePath.replace(/\.[jt]sx?$/, '');
    const siblingTest = [`${basename}.spec.ts`, `${basename}.spec.tsx`, `${basename}.test.ts`, `${basename}.test.tsx`]
      .find((candidate) => fs.existsSync(path.resolve(repoRoot, candidate)));
    if (!siblingTest || !changedTests.has(siblingTest)) {
      findings.push(issueWithSuggestion({
        kind: 'tests',
        category: 'important',
        title: 'Changed production code lacks corresponding test updates',
        summary: 'The diff touches runtime code without showing an updated sibling test for the new behavior or edge cases.',
        filePath: file.filePath,
        line: file.lines.find((entry) => entry.type === 'added')?.lineNumber,
        problematicSnippet: file.lines.find((entry) => entry.type === 'added')?.content,
        fixExample: `Add or update ${path.basename(siblingTest ?? `${basename}.spec.ts`)} with a case covering the changed branch and at least one failure path.`,
        benefit: 'Reviewers get direct proof that the changed behavior is intentional and regression-resistant.',
      }));
    }
  }
  return findings;
};

export const scanSecurityIssues = (files: DiffFile[]): ReviewFinding[] => {
  const findings: ReviewFinding[] = [];
  const rules: Array<{ pattern: RegExp; title: string; summary: string; category: ReviewFindingCategory; fixExample: string; benefit: string }> = [
    {
      pattern: /\binnerHTML\s*=|\bdangerouslySetInnerHTML\b/,
      title: 'Unsanitized HTML sink added',
      summary: 'The diff introduces a direct HTML sink that can become an XSS vector if any input is not fully trusted.',
      category: 'blocking',
      fixExample: 'Render trusted text nodes or sanitize the HTML payload before assignment.',
      benefit: 'Eliminates a common path for script injection and UI takeover.',
    },
    {
      pattern: /\beval\s*\(|new Function\s*\(/,
      title: 'Dynamic code execution introduced',
      summary: 'Dynamic evaluation is hard to audit and expands the attack surface significantly.',
      category: 'blocking',
      fixExample: 'Replace dynamic execution with an explicit lookup table or parsed command model.',
      benefit: 'Keeps execution paths enumerable and reviewable.',
    },
    {
      pattern: /\b(password|secret|token|api[_-]?key)\b.{0,20}[:=].+['"][^'"]+['"]/i,
      title: 'Possible hard-coded credential in diff',
      summary: 'The changed line resembles a credential or token literal and should be moved to configuration or secrets storage.',
      category: 'blocking',
      fixExample: 'Read the value from environment or injected configuration, never from source control.',
      benefit: 'Prevents accidental secret leakage and costly rotation work.',
    },
  ];

  for (const file of files) {
    for (const line of file.lines.filter((entry) => entry.type === 'added')) {
      for (const rule of rules) {
        if (!rule.pattern.test(line.content)) {
          continue;
        }
        findings.push(issueWithSuggestion({
          kind: 'security',
          category: rule.category,
          title: rule.title,
          summary: rule.summary,
          filePath: file.filePath,
          line: line.lineNumber,
          risk: 'high',
          problematicSnippet: line.content,
          fixExample: rule.fixExample,
          benefit: rule.benefit,
        }));
      }
    }
  }
  return findings;
};

export const assessPerformance = (files: DiffFile[]): ReviewFinding[] => {
  const findings: ReviewFinding[] = [];
  for (const file of files) {
    const changed = file.lines.filter((entry) => entry.type === 'added');
    for (const line of changed) {
      if (/\bforEach\b|\bmap\b/.test(line.content) && /\bawait\b/.test(changed.map((entry) => entry.content).join('\n'))) {
        findings.push(issueWithSuggestion({
          kind: 'performance',
          category: 'important',
          title: 'Async work inside iterative path may serialize unexpectedly',
          summary: 'The changed block mixes collection iteration and awaited work, which often introduces N+1 latency or unbounded sequential execution.',
          filePath: file.filePath,
          line: line.lineNumber,
          problematicSnippet: line.content,
          fixExample: 'Collect async work first and await `Promise.all(...)`, or document why sequential execution is required.',
          benefit: 'Makes throughput and latency characteristics explicit during review.',
        }));
      }
      if (/useEffect\(/.test(line.content) && /setState|set[A-Z]/.test(changed.map((entry) => entry.content).join('\n')) && /\.tsx?$/.test(file.filePath)) {
        findings.push(issueWithSuggestion({
          kind: 'performance',
          category: 'nice-to-have',
          title: 'React update path may cause avoidable re-renders',
          summary: 'The changed effect appears to update state directly and may benefit from a more deliberate dependency or event boundary.',
          filePath: file.filePath,
          line: line.lineNumber,
          problematicSnippet: line.content,
          fixExample: 'Confirm the dependency list is minimal and move event-bound logic out of render-cycle effects where possible.',
          benefit: 'Reduces unnecessary work on interactive surfaces.',
        }));
      }
    }
  }
  return findings;
};

export const enforceCodeQuality = (files: DiffFile[]): ReviewFinding[] => {
  const findings: ReviewFinding[] = [];
  for (const file of files) {
    const content = file.lines.filter((entry) => entry.type === 'added').map((entry) => entry.content).join('\n');
    if ((content.match(/\bconsole\.(log|debug)\b/g) ?? []).length > 0) {
      findings.push(issueWithSuggestion({
        kind: 'quality',
        category: 'nice-to-have',
        title: 'Debug logging left in changed code',
        summary: 'The review diff still includes debug logging that is rarely useful in committed runtime paths.',
        filePath: file.filePath,
        problematicSnippet: content.split('\n').find((line) => /\bconsole\.(log|debug)\b/.test(line)),
        fixExample: 'Remove the debug statement or route it through the project tracing surface if it is intentionally durable.',
        benefit: 'Keeps production logs focused on actionable signals.',
      }));
    }
    if ((content.match(/\bany\b/g) ?? []).length > 1) {
      findings.push(issueWithSuggestion({
        kind: 'quality',
        category: 'important',
        title: 'Changed code leans on broad `any` typing',
        summary: 'The diff introduces or expands weak typing in code that could usually express a safer contract.',
        filePath: file.filePath,
        problematicSnippet: content.split('\n').find((line) => /\bany\b/.test(line)),
        fixExample: 'Define a narrow interface or union type for the payload instead of widening to `any`.',
        benefit: 'Improves compiler-backed review coverage and reduces latent integration bugs.',
      }));
    }
  }
  return findings;
};

export const assessCodebasePatterns = (files: DiffFile[]): ReviewFinding[] => {
  const findings: ReviewFinding[] = [];
  for (const file of files) {
    if (file.filePath.endsWith('.tsx')) {
      const content = file.lines.filter((entry) => entry.type === 'added').map((entry) => entry.content).join('\n');
      if (/useMemo|useCallback/.test(content) && !/useDeferredValue|startTransition|useEffectEvent/.test(content)) {
        findings.push(issueWithSuggestion({
          kind: 'pattern',
          category: 'question',
          title: 'New React memoization should match repo guidance',
          summary: 'The repo prefers modern React compiler-era patterns and typically avoids defaulting to `useMemo` or `useCallback` without clear need.',
          filePath: file.filePath,
          problematicSnippet: content.split('\n').find((line) => /useMemo|useCallback/.test(line)),
          fixExample: 'Confirm the memoization is necessary or prefer simpler data flow consistent with the surrounding dashboard code.',
          benefit: 'Keeps the review aligned with established frontend conventions in this repo.',
        }));
      }
    }
  }
  return findings;
};

export const categorizeAndPrioritizeFeedback = (findings: ReviewFinding[]): ReviewFinding[] => {
  const rank: Record<ReviewFindingCategory, number> = {
    blocking: 0,
    important: 1,
    'nice-to-have': 2,
    question: 3,
  };
  return [...findings].sort((left, right) => {
    const categoryDelta = rank[left.category] - rank[right.category];
    if (categoryDelta !== 0) {
      return categoryDelta;
    }
    return (left.filePath ?? '').localeCompare(right.filePath ?? '');
  });
};

export const generateActionableSuggestion = (issue: ReviewFinding): string => {
  const location = issue.filePath ? `\`${issue.filePath}${issue.line ? `:${issue.line}` : ''}\`` : 'general';
  return [
    `### ${issue.category.toUpperCase()} · ${issue.title}`,
    `${location}`,
    issue.summary,
    issue.problematicSnippet ? `Problematic code:\n\`\`\`ts\n${issue.problematicSnippet}\n\`\`\`` : '',
    issue.fixExample ? `Suggested fix:\n\`\`\`ts\n${issue.fixExample}\n\`\`\`` : '',
    issue.benefit ? `Benefit: ${issue.benefit}` : '',
  ].filter(Boolean).join('\n\n');
};

const renderFindingsMarkdown = (findings: ReviewFinding[]): string => {
  const grouped = new Map<ReviewFindingCategory, ReviewFinding[]>();
  for (const finding of findings) {
    const bucket = grouped.get(finding.category) ?? [];
    bucket.push(finding);
    grouped.set(finding.category, bucket);
  }
  return (['blocking', 'important', 'nice-to-have', 'question'] as ReviewFindingCategory[])
    .filter((category) => (grouped.get(category)?.length ?? 0) > 0)
    .map((category) => {
      const entries = grouped.get(category) ?? [];
      return [`## ${category}`, ...entries.map((entry) => generateActionableSuggestion(entry))].join('\n\n');
    })
    .join('\n\n');
};

const touchesCriticalPaths = (files: DiffFile[]): boolean =>
  files.some((file) =>
    /^(apps\/orchestrator|packages\/shared-governance|packages\/shared-tracing|packages\/shared-types|packages\/protocol|packages\/federation-bus)\//.test(file.filePath));

export const runCodeReview = (input: {
  prId: string;
  project?: string;
  repoRoot?: string;
  prBody?: string;
}): CodeReviewResult => {
  const context = resolveProjectContext({ project: input.project, repoRoot: input.repoRoot });
  const headRef = resolveHeadRef(context.repoRoot, input.prId);
  const baseRef = resolveBaseRef(context.repoRoot, headRef);
  const diff = runGit(context.repoRoot, 'diff', '--unified=0', `${baseRef}...${headRef}`);
  const files = parseUnifiedDiff(diff);
  const prBody = input.prBody ?? tryGit(context.repoRoot, 'log', '-1', '--pretty=%B', headRef) ?? '';
  const backend = chooseBackendDecision({
    taskType: 'code-review',
    stage: 'review',
    summary: `${input.prId} ${files.map((file) => file.filePath).join(' ')}`,
    preferAppleIntelligence: true,
    appleRuntimeAvailable: process.env.DROIDSWARM_APPLE_INTELLIGENCE_ENABLED !== '0',
    mlxAvailable: process.env.DROIDSWARM_MLX_ENABLED === '1',
    platform: process.platform,
    arch: process.arch,
  }).backend;

  const findings = categorizeAndPrioritizeFeedback([
    ...validatePRDescription(files, prBody),
    ...analyzeCodeChanges(files),
    ...checkTestCoverage(files, context.repoRoot),
    ...scanSecurityIssues(files),
    ...assessPerformance(files),
    ...enforceCodeQuality(files),
    ...assessCodebasePatterns(files),
  ]);
  const findingsMarkdown = renderFindingsMarkdown(findings);
  const status: CodeReviewRunRecord['status'] = findings.some((entry) => entry.kind === 'pr-description')
    ? 'clarification-needed'
    : 'completed';
  const consensus = touchesCriticalPaths(files)
    ? runConsensusRound({
      proposalType: 'code-review',
      title: `Review ${input.prId}`,
      summary: `Critical-path code review for ${input.prId}`,
      glyph: 'EVT-CONSENSUS-REVIEW',
      context: {
        eventType: 'governance.vote',
        actorRole: 'reviewer',
        swarmRole: 'master',
        projectId: context.projectId,
        auditLoggingEnabled: true,
        dashboardEnabled: true,
        droidspeakState: {
          compact: 'EVT-CONSENSUS-REVIEW',
          expanded: input.prId,
          kind: 'memory_pinned',
        },
      },
    })
    : undefined;
  const summary = status === 'clarification-needed'
    ? 'PR description needs clarification before a full merge recommendation.'
    : findings.length === 0
      ? 'No material review findings.'
      : `${findings.filter((entry) => entry.category === 'blocking').length} blocking, ${findings.filter((entry) => entry.category === 'important').length} important findings.`;
  const reviewId = randomUUID();
  const audit = appendAuditEvent('CODE_REVIEW_COMPLETED', {
    reviewId,
    projectId: context.projectId,
    prId: input.prId,
    status,
    backend,
    findings,
    consensusId: consensus?.consensusId,
  });
  const stored = upsertCodeReviewRun({
    reviewId,
    projectId: context.projectId,
    prId: input.prId,
    title: `Review ${input.prId}`,
    status,
    summary,
    backend,
    reviewAgent: 'code-review-agent',
    repoRoot: context.repoRoot,
    baseRef,
    headRef,
    findings: findings as unknown as Array<Record<string, unknown>>,
    findingsMarkdown,
    consensusId: consensus?.consensusId,
    auditHash: audit.hash,
  });
  return {
    reviewId: stored.reviewId,
    projectId: stored.projectId,
    prId: stored.prId,
    title: stored.title,
    status: stored.status,
    summary: stored.summary,
    findings,
    findingsMarkdown,
    consensusId: stored.consensusId,
    auditHash: stored.auditHash,
    backend,
    repoRoot: context.repoRoot,
    baseRef,
    headRef,
  };
};
