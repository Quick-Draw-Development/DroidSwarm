const dictionary: Record<string, string> = {
  blk: 'Blocked on',
  need: 'Needs',
  dep: 'Depends on',
  next: 'Next',
  done: 'Done',
  risk: 'Risk',
  st: 'State',
  ctx: 'Context',
  prog: 'in progress',
  wait: 'waiting',
  err: 'error',
  ok: 'validated',
  do: 'do',
  ask: 'ask',
  vote: 'vote',
  chk: 'check',
  impl: 'implement',
  spec: 'spec',
  prep: 'prepare',
  merge: 'merge',
  plan: 'plan',
  test: 'test',
  fix: 'fix',
  api: 'API',
  ui: 'UI',
  db: 'database',
  auth: 'authentication',
  schema: 'schema',
  path: 'path',
  pr: 'PR',
  diff: 'diff',
  ctx_ref: 'context reference',
  sess: 'session',
  trace: 'trace',
  hum: 'human',
  fe: 'frontend',
  be: 'backend',
  qa: 'QA',
  arch: 'architect',
  planr: 'planner',
  crit: 'critic',
};

export interface DroidspeakV2Renderable {
  compact: string;
  expanded: string;
  kind: 'plan_status' | 'blocked' | 'unblocked' | 'handoff_ready' | 'verification_needed' | 'summary_emitted' | 'memory_pinned';
}

const droidspeakKindLabels: Record<DroidspeakV2Renderable['kind'], string> = {
  plan_status: 'Plan',
  blocked: 'Blocked',
  unblocked: 'Unblocked',
  handoff_ready: 'Handoff',
  verification_needed: 'Verification',
  summary_emitted: 'Summary',
  memory_pinned: 'Memory',
};

const capitalize = (value: string): string => (value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '');

const translateSegment = (segment: string): { text: string; unknownTokens: string[] } => {
  if (!segment) {
    return { text: '', unknownTokens: [] };
  }

  const normalized = segment.toLowerCase();
  const plusSplits = normalized.split('+').map((value) => value.trim()).filter(Boolean);
  if (!plusSplits.length) {
    return { text: '', unknownTokens: [] };
  }

  const unknownTokens: Set<string> = new Set();
  const parts = plusSplits.map((part) => {
    const hyphenParts = part.split('-').map((value) => value.trim()).filter(Boolean);
    const translatedParts = hyphenParts.map((chunk) => {
      const translation = dictionary[chunk] ?? chunk;
      if (!dictionary[chunk]) {
        unknownTokens.add(chunk);
      }
      return translation;
    });
    return translatedParts.join(' ');
  });

  return {
    text: parts.join(' and '),
    unknownTokens: [...unknownTokens],
  };
};

const renderTokens = (tokens: string[]): { text: string; unknownTokens: string[] } => {
  const fragments = tokens.map((token) => translateSegment(token));
  const text = fragments.map((fragment) => fragment.text).filter(Boolean).join(' ');
  const unknownTokens = fragments.flatMap((fragment) => fragment.unknownTokens);
  return { text: text.trim(), unknownTokens };
};

const clauseTemplates: Record<string, (tokens: string[]) => { translation: string; unknownTokens: string[] }> = {
  blk: (tokens) => {
    const { text, unknownTokens } = renderTokens(tokens);
    const subject = text || 'unknown subject';
    return { translation: `Blocked on ${subject}.`, unknownTokens };
  },
  need: (tokens) => {
    const [roleToken, actionToken, ...targetTokens] = tokens;
    const role = renderTokens(roleToken ? [roleToken] : []);
    const action = renderTokens(actionToken ? [actionToken] : []);
    const target = renderTokens(targetTokens);
    const unknownTokens = [...role.unknownTokens, ...action.unknownTokens, ...target.unknownTokens];
    const roleText = role.text || 'Unknown role';
    const actionText = action.text || 'act';
    const targetText = target.text ? ` ${target.text}` : '';
    return {
      translation: `${capitalize(roleText)} needs to ${actionText}${targetText}.`,
      unknownTokens,
    };
  },
  next: (tokens) => {
    const { text, unknownTokens } = renderTokens(tokens);
    return { translation: `Next step: ${text || 'undefined action'}.`, unknownTokens };
  },
  done: (tokens) => {
    const { text, unknownTokens } = renderTokens(tokens);
    return { translation: `${capitalize(text || 'Activity')} done.`, unknownTokens };
  },
  risk: (tokens) => {
    const { text, unknownTokens } = renderTokens(tokens);
    return { translation: `Risk: ${text || 'unknown area'}. Prompting humans for verification.`, unknownTokens };
  },
  st: (tokens) => {
    const { text, unknownTokens } = renderTokens(tokens);
    return { translation: `State: ${text || 'unknown'}.`, unknownTokens };
  },
  ctx: (tokens) => {
    const { text, unknownTokens } = renderTokens(tokens);
    return { translation: `Context: ${text || 'none'}.`, unknownTokens };
  },
};

export interface DroidspeakTranslation {
  translation: string;
  clauseCount: number;
  unknownTokens: string[];
  badgeLabel?: string;
  compact?: string;
}

export const translateDroidspeakV2 = (state: DroidspeakV2Renderable): DroidspeakTranslation => ({
  translation: state.expanded,
  clauseCount: 1,
  unknownTokens: [],
  badgeLabel: droidspeakKindLabels[state.kind],
  compact: state.compact,
});

export const translateDroidspeak = (input: string): DroidspeakTranslation => {
  const clauses = input.split(';').map((clause) => clause.trim()).filter(Boolean);
  const clauseResults = clauses.map((clause) => {
    const tokens = clause.split(/\s+/).map((token) => token.trim()).filter(Boolean);
    if (!tokens.length) {
      return { translation: '', unknownTokens: [] };
    }
    const [head, ...restTokens] = tokens;
    const template = clauseTemplates[head.toLowerCase()];
    const headTranslation = translateSegment(head);
    const restTranslation = renderTokens(restTokens);
    const fallback: { translation: string; unknownTokens: string[] } = {
      translation: `${capitalize(headTranslation.text)} ${restTranslation.text}.`.trim(),
      unknownTokens: [...headTranslation.unknownTokens, ...restTranslation.unknownTokens],
    };

    if (template) {
      const templateResult = template(restTokens);
      const unknowns = [...headTranslation.unknownTokens, ...templateResult.unknownTokens];
      return {
        translation: templateResult.translation,
        unknownTokens: unknowns,
      };
    }

    return fallback;
  });

  const translation = clauseResults
    .map((result) => result.translation)
    .filter(Boolean)
    .join(' ');
  const unknownTokens = [...new Set(clauseResults.flatMap((result) => result.unknownTokens))];

  return {
    translation: translation.trim(),
    clauseCount: clauses.length,
    unknownTokens,
  };
};
