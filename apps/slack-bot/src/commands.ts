import { chooseBackendDecision, type ModelRouteDecision } from '@model-router';

export type SlackCommandKind =
  | 'help'
  | 'projects'
  | 'project-use'
  | 'task-message'
  | 'operator-message';

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
  }
};
