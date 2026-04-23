export type SlackCommandKind =
  | 'help'
  | 'status'
  | 'projects'
  | 'agents'
  | 'task-start'
  | 'swarm-pause'
  | 'swarm-resume'
  | 'unsupported';

export interface ParsedSlackCommand {
  kind: SlackCommandKind;
  rawText: string;
  args: string[];
}

export interface SlackCommandResponse {
  text: string;
}

const tokenize = (input: string): string[] =>
  input
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export const parseSlackCommand = (text: string): ParsedSlackCommand => {
  const args = tokenize(text);
  if (args.length === 0 || args[0] === 'help') {
    return { kind: 'help', rawText: text, args: [] };
  }

  if (args[0] === 'status') {
    return { kind: 'status', rawText: text, args: args.slice(1) };
  }

  if (args[0] === 'projects') {
    return { kind: 'projects', rawText: text, args: args.slice(1) };
  }

  if (args[0] === 'agents') {
    return { kind: 'agents', rawText: text, args: args.slice(1) };
  }

  if (args[0] === 'task' && args[1] === 'start') {
    return { kind: 'task-start', rawText: text, args: args.slice(2) };
  }

  if (args[0] === 'swarm' && args[1] === 'pause') {
    return { kind: 'swarm-pause', rawText: text, args: args.slice(2) };
  }

  if (args[0] === 'swarm' && args[1] === 'resume') {
    return { kind: 'swarm-resume', rawText: text, args: args.slice(2) };
  }

  return { kind: 'unsupported', rawText: text, args };
};

export const renderSlackCommandResponse = (command: ParsedSlackCommand): SlackCommandResponse => {
  switch (command.kind) {
    case 'help':
      return {
        text: [
          '*DroidSwarm Slack bot scaffold*',
          '`/droid status`',
          '`/droid projects`',
          '`/droid agents`',
          '`/droid task start <project> <description>`',
          '`/droid swarm pause <swarm-id>`',
          '`/droid swarm resume <swarm-id>`',
          'Execution hooks are intentionally deferred to orchestrator/shared-projects work.',
        ].join('\n'),
      };
    case 'status':
    case 'projects':
    case 'agents':
      return {
        text: `\`${command.kind}\` is scaffolded, but live multi-project state wiring is not part of this slice yet.`,
      };
    case 'task-start':
      return {
        text: 'Task creation command parsed successfully. Execution routing will be connected in a later slice.',
      };
    case 'swarm-pause':
    case 'swarm-resume':
      return {
        text: `Swarm control command \`${command.kind}\` parsed successfully. Runtime execution is deferred to a later slice.`,
      };
    default:
      return {
        text: 'Unknown command. Use `/droid help` to view the supported scaffolded commands.',
      };
  }
};
