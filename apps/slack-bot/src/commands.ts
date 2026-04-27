import { chooseBackendDecision, type ModelRouteDecision } from '@model-router';

export type SlackCommandKind =
  | 'help'
  | 'projects'
  | 'project-use'
  | 'task-message'
  | 'operator-message'
  | 'law-status'
  | 'law-propose'
  | 'law-approve'
  | 'law-override'
  | 'review-run'
  | 'models-list'
  | 'models-refresh'
  | 'skills-list'
  | 'skill-create'
  | 'skill-approve'
  | 'agent-create';

export interface SlackParseContext {
  preferAppleIntelligence?: boolean;
  appleRuntimeAvailable?: boolean;
  mlxAvailable?: boolean;
  platform?: string;
  arch?: string;
}

export interface ParsedSlackCommand {
  kind: SlackCommandKind;
  rawText: string;
  args: string[];
  projectHint?: string;
  taskId?: string;
  content?: string;
  proposalId?: string;
  name?: string;
  skills?: string[];
  template?: string;
  priority?: 'low' | 'medium' | 'high';
  source: 'slash' | 'natural-language';
  route: ModelRouteDecision;
}

export interface SlackCommandResponse {
  text: string;
}

const tokenize = (input: string): string[] =>
  input
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const buildRouteDecision = (text: string, context?: SlackParseContext): ModelRouteDecision =>
  chooseBackendDecision({
    summary: text,
    taskType: 'slack-relay',
    stage: 'intent-parse',
    preferAppleIntelligence: context?.preferAppleIntelligence,
    appleRuntimeAvailable: context?.appleRuntimeAvailable,
    mlxAvailable: context?.mlxAvailable,
    platform: context?.platform,
    arch: context?.arch,
  });

const buildCommand = (
  rawText: string,
  route: ModelRouteDecision,
  input: Omit<ParsedSlackCommand, 'rawText' | 'route'>,
): ParsedSlackCommand => ({
  rawText,
  route,
  ...input,
});

const parseUseCommand = (text: string, route: ModelRouteDecision, args: string[], source: ParsedSlackCommand['source']): ParsedSlackCommand | undefined => {
  if ((args[0] === 'use' || args[0] === 'project') && args[1]) {
    return buildCommand(text, route, {
      kind: 'project-use',
      args: args.slice(1),
      projectHint: args[1],
      source,
    });
  }
  return undefined;
};

const parseTaskRelay = (text: string, route: ModelRouteDecision, source: ParsedSlackCommand['source']): ParsedSlackCommand | undefined => {
  const match = text.trim().match(/^(?:task\s+)?([a-zA-Z0-9-]{8,})\s*[:\-]\s+(.+)$/);
  if (!match) {
    return undefined;
  }
  return buildCommand(text, route, {
    kind: 'task-message',
    args: [match[1], match[2]],
    taskId: match[1],
    content: match[2],
    source,
  });
};

const parseSlashCommand = (text: string, route: ModelRouteDecision): ParsedSlackCommand => {
  const trimmed = text.trim();
  const args = tokenize(trimmed);
  if (args.length === 0 || args[0] === 'help') {
    return buildCommand(text, route, { kind: 'help', args: [], source: 'slash' });
  }

  if (args[0] === 'projects') {
    return buildCommand(text, route, { kind: 'projects', args: [], source: 'slash' });
  }

  if (args[0] === 'skills' && args[1] === 'list') {
    return buildCommand(text, route, { kind: 'skills-list', args: [], source: 'slash' });
  }

  if (args[0] === 'models' && (args[1] === 'list' || args[1] === 'status')) {
    return buildCommand(text, route, { kind: 'models-list', args: args.slice(2), source: 'slash' });
  }

  if (args[0] === 'models' && args[1] === 'refresh') {
    return buildCommand(text, route, { kind: 'models-refresh', args: args.slice(2), source: 'slash' });
  }

  if (args[0] === 'law' && args[1] === 'propose' && args.length > 2) {
    return buildCommand(text, route, {
      kind: 'law-propose',
      args: args.slice(2),
      content: trimmed.replace(/^law\s+propose\s+/i, ''),
      source: 'slash',
    });
  }

  if (args[0] === 'law' && args[1] === 'status') {
    return buildCommand(text, route, {
      kind: 'law-status',
      args: [],
      source: 'slash',
    });
  }

  if (args[0] === 'law' && args[1] === 'approve' && args[2]) {
    return buildCommand(text, route, {
      kind: 'law-approve',
      args: args.slice(2),
      proposalId: args[2],
      source: 'slash',
    });
  }

  if (args[0] === 'override' && args[1]) {
    return buildCommand(text, route, {
      kind: 'law-override',
      args: args.slice(1),
      proposalId: args[1],
      source: 'slash',
    });
  }

  if (args[0] === 'review' && args[1]) {
    return buildCommand(text, route, {
      kind: 'review-run',
      args: args.slice(1),
      content: args[1],
      source: 'slash',
    });
  }

  if (args[0] === 'skill' && args[1] === 'create' && args[2]) {
    return buildCommand(text, route, {
      kind: 'skill-create',
      args: args.slice(2),
      name: args[2],
      template: args[3],
      source: 'slash',
    });
  }

  if (args[0] === 'skill' && args[1] === 'approve' && args[2]) {
    return buildCommand(text, route, {
      kind: 'skill-approve',
      args: args.slice(2),
      name: args[2],
      source: 'slash',
    });
  }

  if (args[0] === 'agent' && args[1] === 'create' && args[2] && args[3]) {
    return buildCommand(text, route, {
      kind: 'agent-create',
      args: args.slice(2),
      name: args[2],
      skills: args[3].split(',').map((entry) => entry.trim()).filter(Boolean),
      priority: args[4] === 'low' || args[4] === 'high' ? args[4] : 'medium',
      source: 'slash',
    });
  }

  const useCommand = parseUseCommand(trimmed, route, args, 'slash');
  if (useCommand) {
    return useCommand;
  }

  const taskRelay = parseTaskRelay(trimmed, route, 'slash');
  if (taskRelay) {
    return taskRelay;
  }

  return buildCommand(text, route, {
    kind: 'operator-message',
    args,
    content: trimmed,
    source: 'slash',
  });
};

const parseNaturalLanguage = (text: string, route: ModelRouteDecision): ParsedSlackCommand => {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower.length === 0 || lower === 'help' || lower.includes('what can you do')) {
    return buildCommand(text, route, { kind: 'help', args: [], source: 'natural-language' });
  }

  if (/^(show|list)?\s*projects\b/.test(lower)) {
    return buildCommand(text, route, { kind: 'projects', args: [], source: 'natural-language' });
  }

  if (/^(show|list)\s+skills\b/.test(lower)) {
    return buildCommand(text, route, { kind: 'skills-list', args: [], source: 'natural-language' });
  }

  if (/^(show|list)\s+models\b/.test(lower)) {
    return buildCommand(text, route, { kind: 'models-list', args: [], source: 'natural-language' });
  }

  if (/^models\s+refresh$/i.test(trimmed)) {
    return buildCommand(text, route, { kind: 'models-refresh', args: [], source: 'natural-language' });
  }

  const lawProposalMatch = trimmed.match(/^law\s+propose\s+(.+)$/i);
  if (lawProposalMatch?.[1]) {
    return buildCommand(text, route, {
      kind: 'law-propose',
      args: tokenize(lawProposalMatch[1]),
      content: lawProposalMatch[1],
      source: 'natural-language',
    });
  }

  if (/^law\s+status$/i.test(trimmed)) {
    return buildCommand(text, route, {
      kind: 'law-status',
      args: [],
      source: 'natural-language',
    });
  }

  const lawApproveMatch = trimmed.match(/^law\s+approve\s+([a-z0-9-]+)$/i);
  if (lawApproveMatch?.[1]) {
    return buildCommand(text, route, {
      kind: 'law-approve',
      args: [lawApproveMatch[1]],
      proposalId: lawApproveMatch[1],
      source: 'natural-language',
    });
  }

  const lawOverrideMatch = trimmed.match(/^override\s+([a-z0-9-]+)$/i);
  if (lawOverrideMatch?.[1]) {
    return buildCommand(text, route, {
      kind: 'law-override',
      args: [lawOverrideMatch[1]],
      proposalId: lawOverrideMatch[1],
      source: 'natural-language',
    });
  }

  const reviewMatch = trimmed.match(/^review\s+(.+)$/i);
  if (reviewMatch?.[1]) {
    return buildCommand(text, route, {
      kind: 'review-run',
      args: [reviewMatch[1]],
      content: reviewMatch[1],
      source: 'natural-language',
    });
  }

  const skillCreateMatch = trimmed.match(/^skill\s+create\s+([a-z0-9-]+)(?:\s+([a-z]+))?$/i);
  if (skillCreateMatch?.[1]) {
    return buildCommand(text, route, {
      kind: 'skill-create',
      args: skillCreateMatch.slice(1).filter((entry): entry is string => typeof entry === 'string'),
      name: skillCreateMatch[1],
      template: skillCreateMatch[2],
      source: 'natural-language',
    });
  }

  const skillApproveMatch = trimmed.match(/^skill\s+approve\s+([a-z0-9-]+)$/i);
  if (skillApproveMatch?.[1]) {
    return buildCommand(text, route, {
      kind: 'skill-approve',
      args: [skillApproveMatch[1]],
      name: skillApproveMatch[1],
      source: 'natural-language',
    });
  }

  const agentCreateMatch = trimmed.match(/^agent\s+create\s+([a-z0-9-]+)\s+([a-z0-9,-]+)(?:\s+(low|medium|high))?$/i);
  if (agentCreateMatch?.[1] && agentCreateMatch[2]) {
    return buildCommand(text, route, {
      kind: 'agent-create',
      args: agentCreateMatch.slice(1).filter((entry): entry is string => typeof entry === 'string'),
      name: agentCreateMatch[1],
      skills: agentCreateMatch[2].split(',').map((entry) => entry.trim()).filter(Boolean),
      priority: agentCreateMatch[3] === 'low' || agentCreateMatch[3] === 'high' ? agentCreateMatch[3] : 'medium',
      source: 'natural-language',
    });
  }

  const useMatch = lower.match(/(?:use|switch to|select)\s+(?:project\s+)?([a-z0-9._/-]+)/i);
  if (useMatch?.[1]) {
    return buildCommand(text, route, {
      kind: 'project-use',
      args: [useMatch[1]],
      projectHint: useMatch[1],
      source: 'natural-language',
    });
  }

  const taskRelay = parseTaskRelay(trimmed, route, 'natural-language');
  if (taskRelay) {
    return taskRelay;
  }

  return buildCommand(text, route, {
    kind: 'operator-message',
    args: tokenize(trimmed),
    content: trimmed,
    source: 'natural-language',
  });
};

export const parseSlackCommand = (text: string, context?: SlackParseContext): ParsedSlackCommand => {
  const route = buildRouteDecision(text, context);
  const trimmed = text.trim();
  return parseSlashCommand(trimmed.startsWith('/') ? trimmed.slice(1) : trimmed, route);
};

export const parseSlackIntent = (text: string, context?: SlackParseContext): ParsedSlackCommand => {
  const trimmed = text.trim();
  const route = buildRouteDecision(trimmed, context);
  const args = tokenize(trimmed);
  const looksCommandLike = args.length > 0 && [
    'help',
    'projects',
    'use',
    'project',
    'law',
    'override',
    'review',
    'models',
  ].includes(args[0]?.toLowerCase() ?? '');

  if (trimmed.startsWith('/')) {
    return parseSlashCommand(trimmed.slice(1), route);
  }
  return looksCommandLike ? parseSlashCommand(trimmed, route) : parseNaturalLanguage(trimmed, route);
};

export const renderSlackCommandResponse = (command: ParsedSlackCommand): SlackCommandResponse => {
  switch (command.kind) {
    case 'help':
      return {
        text: [
          '*DroidSwarm Slack relay*',
          '`/droid use <project>` selects the active project.',
          '`/droid projects` lists registered projects.',
          '`/droid law status` shows law, consensus, and drift status.',
          '`/droid override <proposal-id>` forces a human override for a proposal.',
          '`/droid review <pr-id>` runs the code-review-agent on a branch or PR identifier.',
          '`/droid models list` shows the shared model inventory.',
          '`/droid models refresh` rescans local models and updates the registry.',
          '`/droid skills list` lists registered skills and specialized agents.',
          '`/droid skill create <name> [template]` scaffolds a new skill.',
          '`/droid agent create <name> <skill1,skill2> [priority]` creates a specialized agent.',
          '`/droid <message>` forwards a message to the orchestrator operator room.',
          '`/droid <task-id>: <message>` forwards a message to a task room.',
          'Direct messages and mentions use the same parsing rules.',
        ].join('\n'),
      };
    case 'projects':
      return {
        text: 'Listing registered projects.',
      };
    case 'project-use':
      return {
        text: `Switching Slack relay context to \`${command.projectHint ?? 'unknown'}\`.`,
      };
    case 'task-message':
      return {
        text: `Forwarding to task \`${command.taskId ?? 'unknown'}\`.`,
      };
    case 'operator-message':
      return {
        text: 'Forwarding to the orchestrator operator room.',
      };
    case 'law-status':
      return {
        text: 'Fetching governance status.',
      };
    case 'law-propose':
      return {
        text: 'Submitting a governance law proposal for debate.',
      };
    case 'law-approve':
      return {
        text: `Approving governance proposal \`${command.proposalId ?? 'unknown'}\`.`,
      };
    case 'law-override':
      return {
        text: `Overriding governance proposal \`${command.proposalId ?? 'unknown'}\`.`,
      };
    case 'review-run':
      return {
        text: `Running a code review for \`${command.content ?? 'unknown'}\`.`,
      };
    case 'models-list':
      return {
        text: 'Listing registered models.',
      };
    case 'models-refresh':
      return {
        text: 'Refreshing local model inventory.',
      };
    case 'skills-list':
      return {
        text: 'Listing registered skills and specialized agents.',
      };
    case 'skill-create':
      return {
        text: `Creating skill \`${command.name ?? 'unknown'}\`.`,
      };
    case 'skill-approve':
      return {
        text: `Approving skill \`${command.name ?? 'unknown'}\`.`,
      };
    case 'agent-create':
      return {
        text: `Creating specialized agent \`${command.name ?? 'unknown'}\`.`,
      };
  }
};
