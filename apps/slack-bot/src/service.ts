import fs from 'node:fs';
import path from 'node:path';

import WebSocket from 'ws';

import { appendAuditEvent, tracer } from '@shared-tracing';
import { approveLawProposal, listLawProposals, runGovernanceDebate, validateCompliance } from '@shared-governance';
import {
  approveRegisteredSkill,
  approveSpecializedAgent,
  createAgentManifest,
  createSkillScaffold,
  listRegisteredSkillManifests,
  listSpecializedAgents,
  resolveSkillsRoot,
} from '@shared-skills';
import {
  getCurrentProject,
  listRegisteredProjects,
  resolveProjectLookup,
  setCurrentProject,
  type ProjectRegistryRecord,
} from '@shared-projects';

import type { SlackBotRuntimeConfig } from './config';
import { parseSlackIntent, renderSlackCommandResponse, type ParsedSlackCommand } from './commands';

export interface SlackUserContext {
  userId: string;
  username: string;
  channelId?: string;
  threadTs?: string;
}

export interface SlackSessionMemory {
  currentProjectId?: string;
  recentMessages: string[];
}

export interface SlackIntentResult {
  text: string;
  projectId?: string;
  backend: string;
}

type TaskDispatchStatus = 'accepted' | 'queued' | 'offline';

type SlackMirrorTarget = {
  channelId: string;
  threadTs?: string;
};

type SocketLike = {
  send(data: string): void;
  close(): void;
  terminate?(): void;
  on(event: 'open' | 'message' | 'error' | 'close', listener: (...args: unknown[]) => void): void;
};

type MessageEnvelopeLike = {
  message_id?: string;
  project_id?: string;
  room_id?: string;
  task_id?: string;
  type?: string;
  from?: {
    actor_type?: string;
    actor_id?: string;
    actor_name?: string;
  };
  payload?: Record<string, unknown>;
};

export interface SlackBotDependencies {
  dispatchMessage: (input: {
    username: string;
    roomId: string;
    project: ProjectRegistryRecord;
    operatorToken?: string;
    messageType: 'chat';
    taskId?: string;
    payload: Record<string, unknown>;
  }) => Promise<TaskDispatchStatus>;
  postSlackMessage: (input: {
    channelId: string;
    text: string;
    threadTs?: string;
  }) => Promise<{ ts?: string } | void>;
  socketFactory: (url: string) => SocketLike;
}

const slackSessionMemory = new Map<string, SlackSessionMemory>();
const roomMirrorTargets = new Map<string, SlackMirrorTarget>();
const roomSubscriptions = new Map<string, {
  socket: SocketLike;
  authenticated: boolean;
  queue: string[];
  target: SlackMirrorTarget;
}>();
const seenMirroredMessages = new Set<string>();

const defaultSessionMemory = (): SlackSessionMemory => ({
  recentMessages: [],
});

const getSessionMemory = (userId: string): SlackSessionMemory => {
  const existing = slackSessionMemory.get(userId);
  if (existing) {
    return existing;
  }
  const created = defaultSessionMemory();
  slackSessionMemory.set(userId, created);
  return created;
};

export const resetSlackSessionMemory = (): void => {
  slackSessionMemory.clear();
  roomMirrorTargets.clear();
  for (const subscription of roomSubscriptions.values()) {
    subscription.socket.close();
  }
  roomSubscriptions.clear();
  seenMirroredMessages.clear();
};

const buildSocketUrl = (project: ProjectRegistryRecord, fallback: string): string => {
  if (typeof project.wsPort === 'number' && project.wsPort > 0) {
    return `ws://127.0.0.1:${project.wsPort}`;
  }
  return fallback;
};

const roomKey = (projectId: string, roomId: string): string => `${projectId}:${roomId}`;

const appendSlackAudit = (
  eventType: string,
  payload: Record<string, unknown>,
  project?: ProjectRegistryRecord,
): void => {
  if (!project?.dbPath || !fs.existsSync(path.dirname(project.dbPath))) {
    return;
  }
  try {
    appendAuditEvent(eventType, payload, 'slack-bot', {
      dbPath: project.dbPath,
      swarmId: project.projectId,
    });
  } catch (error) {
    tracer.warn('slack.audit.failed', {
      eventType,
      projectId: project.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const formatEnvelopeForSlack = (message: MessageEnvelopeLike): string | undefined => {
  if (message.type === 'status_update') {
    const content = typeof message.payload?.content === 'string' ? message.payload.content : '';
    if (!content || content.includes('Authenticated')) {
      return undefined;
    }
    const actor = message.from?.actor_name ?? message.from?.actor_id ?? 'swarm';
    return `*${actor}* ${content}`;
  }

  if (message.type === 'chat') {
    const content = typeof message.payload?.content === 'string' ? message.payload.content : '';
    if (!content) {
      return undefined;
    }
    const actor = message.from?.actor_name ?? message.from?.actor_id ?? 'swarm';
    return `*${actor}:* ${content}`;
  }

  if (message.type === 'task_intake_accepted') {
    const taskId = typeof message.payload?.task_id === 'string' ? message.payload.task_id : message.task_id;
    return taskId ? `Task \`${taskId}\` accepted by the orchestrator.` : 'Task accepted by the orchestrator.';
  }

  return undefined;
};

const resolveProjectForCommand = (
  command: ParsedSlackCommand,
  userId: string,
  defaultProjectId?: string,
): ProjectRegistryRecord | undefined => {
  const session = getSessionMemory(userId);
  const explicit = command.projectHint
    ? resolveProjectLookup(command.projectHint)
    : undefined;
  if (explicit) {
    return explicit;
  }
  if (session.currentProjectId) {
    const fromSession = resolveProjectLookup(session.currentProjectId);
    if (fromSession) {
      return fromSession;
    }
  }
  const current = getCurrentProject();
  if (current) {
    const selected = resolveProjectLookup(current.projectId);
    if (selected) {
      return selected;
    }
  }
  return defaultProjectId ? resolveProjectLookup(defaultProjectId) : undefined;
};

const defaultDispatchMessage: SlackBotDependencies['dispatchMessage'] = async (input) => {
  const socketUrl = buildSocketUrl(input.project, process.env.DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765');
  return await new Promise<TaskDispatchStatus>((resolve) => {
    const socket = new WebSocket(socketUrl);
    let messageSent = false;
    const timeout = setTimeout(() => {
      socket.terminate();
      resolve(messageSent ? 'queued' : 'offline');
    }, 2_500);

    socket.on('open', () => {
      socket.send(JSON.stringify({
        type: 'auth',
        project_id: input.project.projectId,
        timestamp: new Date().toISOString(),
        payload: {
          room_id: 'operator',
          agent_name: input.username,
          agent_role: 'ui',
          client_type: 'dashboard',
          token: input.operatorToken,
        },
      }));
    });

    socket.on('message', (buffer) => {
      let parsed: MessageEnvelopeLike;
      try {
        parsed = JSON.parse(String(buffer)) as MessageEnvelopeLike;
      } catch {
        return;
      }

      if (parsed.type === 'status_update' && typeof parsed.payload?.content === 'string' && parsed.payload.content.includes('Authenticated')) {
        messageSent = true;
        socket.send(JSON.stringify({
          message_id: `${Date.now()}-${Math.random()}`,
          project_id: input.project.projectId,
          room_id: input.roomId,
          task_id: input.taskId,
          type: input.messageType,
          from: {
            actor_type: 'human',
            actor_id: input.username,
            actor_name: input.username,
          },
          timestamp: new Date().toISOString(),
          payload: input.payload,
        }));
        return;
      }

      if (messageSent) {
        clearTimeout(timeout);
        socket.close();
        resolve('accepted');
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(messageSent ? 'queued' : 'offline');
    });
  });
};

const defaultSocketFactory = (url: string): SocketLike => new WebSocket(url);

const ensureMirrorSubscription = (
  project: ProjectRegistryRecord,
  roomId: string,
  target: SlackMirrorTarget,
  config: SlackBotRuntimeConfig,
  dependencies: SlackBotDependencies,
): void => {
  const key = roomKey(project.projectId, roomId);
  roomMirrorTargets.set(key, target);
  const existing = roomSubscriptions.get(key);
  if (existing) {
    existing.target = target;
    return;
  }

  const socket = dependencies.socketFactory(buildSocketUrl(project, process.env.DROIDSWARM_SOCKET_URL ?? 'ws://127.0.0.1:8765'));
  const state = {
    socket,
    authenticated: false,
    queue: [] as string[],
    target,
  };
  roomSubscriptions.set(key, state);

  socket.on('open', () => {
    socket.send(JSON.stringify({
      type: 'auth',
      project_id: project.projectId,
      timestamp: new Date().toISOString(),
      payload: {
        room_id: roomId,
        agent_name: `slack-${roomId}`,
        agent_role: 'slack-bot',
        client_type: 'dashboard',
        token: config.operatorToken ?? undefined,
      },
    }));
  });

  socket.on('message', (buffer) => {
    let message: MessageEnvelopeLike;
    try {
      message = JSON.parse(String(buffer)) as MessageEnvelopeLike;
    } catch {
      return;
    }
    if (message.type === 'status_update' && typeof message.payload?.content === 'string' && message.payload.content.includes('Authenticated')) {
      state.authenticated = true;
      for (const queued of state.queue.splice(0)) {
        socket.send(queued);
      }
      return;
    }

    if (typeof message.message_id === 'string') {
      if (seenMirroredMessages.has(message.message_id)) {
        return;
      }
      seenMirroredMessages.add(message.message_id);
      if (seenMirroredMessages.size > 500) {
        const first = seenMirroredMessages.values().next().value;
        if (typeof first === 'string') {
          seenMirroredMessages.delete(first);
        }
      }
    }

    if (message.from?.actor_type === 'human') {
      return;
    }

    const formatted = formatEnvelopeForSlack(message);
    if (!formatted) {
      return;
    }

    const latestTarget = roomMirrorTargets.get(key) ?? state.target;
    void dependencies.postSlackMessage({
      channelId: latestTarget.channelId,
      threadTs: roomId === 'operator' ? undefined : latestTarget.threadTs,
      text: formatted,
    });
  });

  socket.on('close', () => {
    roomSubscriptions.delete(key);
  });
  socket.on('error', () => {
    roomSubscriptions.delete(key);
  });
};

const sendViaSubscription = (
  project: ProjectRegistryRecord,
  roomId: string,
  input: {
    username: string;
    content: string;
  },
): TaskDispatchStatus => {
  const key = roomKey(project.projectId, roomId);
  const subscription = roomSubscriptions.get(key);
  if (!subscription) {
    return 'offline';
  }

  const payload = JSON.stringify({
    message_id: `${Date.now()}-${Math.random()}`,
    project_id: project.projectId,
    room_id: roomId,
    task_id: roomId === 'operator' ? undefined : roomId,
    type: 'chat',
    from: {
      actor_type: 'human',
      actor_id: input.username,
      actor_name: input.username,
    },
    timestamp: new Date().toISOString(),
    payload: {
      content: input.content,
      audience: roomId === 'operator' ? 'orchestrator' : 'task',
    },
  });

  if (subscription.authenticated) {
    subscription.socket.send(payload);
    return 'accepted';
  }

  subscription.queue.push(payload);
  return 'queued';
};

export const executeSlackIntent = async (
  command: ParsedSlackCommand,
  user: SlackUserContext,
  config: SlackBotRuntimeConfig,
  dependencies: SlackBotDependencies = {
    dispatchMessage: defaultDispatchMessage,
    postSlackMessage: async () => undefined,
    socketFactory: defaultSocketFactory,
  },
): Promise<SlackIntentResult> => {
  const session = getSessionMemory(user.userId);
  const project = resolveProjectForCommand(command, user.userId, config.defaultProjectId);
  session.recentMessages = [command.rawText, ...session.recentMessages].slice(0, 10);

  if (config.governanceEnabled) {
    const report = validateCompliance({
      eventType: command.kind === 'law-propose' || command.kind === 'law-approve'
        ? 'governance.proposal'
        : command.kind === 'skill-create' || command.kind === 'skill-approve' || command.kind === 'agent-create'
          ? 'skill.register'
          : 'slack.command',
      actorRole: 'slack-bot',
      swarmRole: 'master',
      projectId: project?.projectId ?? config.defaultProjectId,
      auditLoggingEnabled: true,
      dashboardEnabled: false,
      droidspeakState: command.kind === 'law-propose'
        ? { compact: 'EVT-LAW-PROPOSAL', expanded: command.content ?? '', kind: 'memory_pinned' }
        : command.kind === 'law-approve'
          ? { compact: 'EVT-HUMAN-APPROVAL', expanded: command.proposalId ?? '', kind: 'audit_delta' }
          : command.kind === 'skill-create'
            ? { compact: 'EVT-SKILL-REGISTERED', expanded: command.name ?? '', kind: 'memory_pinned' }
            : command.kind === 'skill-approve'
              ? { compact: 'EVT-HUMAN-APPROVAL', expanded: command.name ?? '', kind: 'audit_delta' }
              : command.kind === 'agent-create'
                ? { compact: 'EVT-AGENT-UPDATED', expanded: command.name ?? '', kind: 'memory_pinned' }
          : undefined,
    });
    if (!report.ok) {
      return {
        text: report.laws.filter((entry) => !entry.ok).map((entry) => entry.violations.join(' ')).join(' '),
        backend: command.route.backend,
      };
    }
  }

  appendSlackAudit('SLACK_COMMAND_RECEIVED', {
    userId: user.userId,
    username: user.username,
    kind: command.kind,
    source: command.source,
    backend: command.route.backend,
    text: command.rawText,
  }, project);

  switch (command.kind) {
    case 'help':
      return {
        text: renderSlackCommandResponse(command).text,
        projectId: project?.projectId,
        backend: command.route.backend,
      };
    case 'projects': {
      const projects = listRegisteredProjects();
      const current = getCurrentProject();
      const lines = projects.length === 0
        ? ['No registered projects found.']
        : projects.map((entry) => {
          const suffix = current?.projectId === entry.projectId ? ' (current)' : '';
          return `• ${entry.name} \`${entry.projectId}\`${suffix}`;
        });
      return {
        text: ['*Registered projects*', ...lines].join('\n'),
        backend: command.route.backend,
      };
    }
    case 'project-use': {
      if (!project) {
        return {
          text: `Project \`${command.projectHint ?? 'unknown'}\` was not found in the DroidSwarm registry.`,
          backend: command.route.backend,
        };
      }
      session.currentProjectId = project.projectId;
      setCurrentProject(project.projectId);
      appendSlackAudit('SLACK_PROJECT_SELECTED', {
        userId: user.userId,
        username: user.username,
        projectId: project.projectId,
      }, project);
      return {
        text: `Slack relay now targets *${project.name}* (\`${project.projectId}\`).`,
        projectId: project.projectId,
        backend: command.route.backend,
      };
    }
    case 'law-propose': {
      const content = command.content?.trim();
      if (!content) {
        return {
          text: 'Law proposal content is empty.',
          backend: command.route.backend,
        };
      }
      const debate = runGovernanceDebate({
        lawId: `LAW-${String(listLawProposals().length + 6).padStart(3, '0')}`,
        title: content.split(/[.:]/)[0] ?? content,
        description: content,
        rationale: content,
        glyph: 'EVT-LAW-PROPOSAL',
        proposedBy: user.username,
        context: {
          eventType: 'governance.proposal',
          actorRole: 'planner',
          swarmRole: 'master',
          projectId: project?.projectId ?? config.defaultProjectId,
          auditLoggingEnabled: true,
          dashboardEnabled: false,
          droidspeakState: { compact: 'EVT-LAW-PROPOSAL', expanded: content, kind: 'memory_pinned' },
        },
      });
      return {
        text: debate.status === 'pending-human-approval'
          ? `Proposal \`${debate.proposal.proposalId}\` is pending human approval after debate.`
          : `Proposal \`${debate.proposal.proposalId}\` was rejected during debate.`,
        projectId: project?.projectId,
        backend: command.route.backend,
      };
    }
    case 'law-approve': {
      if (!command.proposalId) {
        return {
          text: 'Missing proposal id.',
          backend: command.route.backend,
        };
      }
      const approved = approveLawProposal(command.proposalId, {
        approvedBy: user.username,
        comment: `Approved from Slack by ${user.username}.`,
      });
      return {
        text: `Governance proposal \`${approved.proposalId}\` approved and activated as ${approved.lawId}.`,
        projectId: project?.projectId,
        backend: command.route.backend,
      };
    }
    case 'skills-list': {
      const skills = listRegisteredSkillManifests();
      const agents = listSpecializedAgents();
      const skillLines = skills.length > 0
        ? skills.slice(0, 8).map((entry) => `• skill \`${entry.name}\` · ${entry.status}`)
        : ['• no skills registered'];
      const agentLines = agents.length > 0
        ? agents.slice(0, 8).map((entry) => `• agent \`${entry.name}\` · ${entry.status} · skills ${entry.skills.join(', ')}`)
        : ['• no specialized agents registered'];
      return {
        text: ['*Skills & Agents*', ...skillLines, ...agentLines].join('\n'),
        projectId: project?.projectId,
        backend: command.route.backend,
      };
    }
    case 'skill-create': {
      if (!command.name) {
        return {
          text: 'Missing skill name.',
          backend: command.route.backend,
        };
      }
      const manifest = createSkillScaffold({
        rootDir: resolveSkillsRoot(),
        name: command.name,
        template: (command.template as 'basic' | 'research' | 'code' | 'review' | 'custom' | undefined) ?? 'basic',
      });
      return {
        text: `Skill \`${manifest.name}\` scaffolded and registered.`,
        projectId: project?.projectId,
        backend: command.route.backend,
      };
    }
    case 'skill-approve': {
      if (!command.name) {
        return {
          text: 'Missing skill name.',
          backend: command.route.backend,
        };
      }
      const approved = approveRegisteredSkill(command.name);
      return {
        text: approved
          ? `Skill \`${approved.name}\` approved and activated.`
          : `Skill \`${command.name}\` was not found.`,
        projectId: project?.projectId,
        backend: command.route.backend,
      };
    }
    case 'agent-create': {
      if (!command.name || !command.skills || command.skills.length === 0) {
        return {
          text: 'Missing agent name or skill list.',
          backend: command.route.backend,
        };
      }
      const manifest = createAgentManifest({
        skillsRoot: resolveSkillsRoot(),
        name: command.name,
        skills: command.skills,
        priority: command.priority,
      });
      const approved = manifest.affectsCoreBehavior ? null : approveSpecializedAgent(manifest.name);
      return {
        text: approved
          ? `Specialized agent \`${approved.name}\` registered and activated.`
          : `Specialized agent \`${manifest.name}\` registered.`,
        projectId: project?.projectId,
        backend: command.route.backend,
      };
    }
    case 'task-message':
    case 'operator-message': {
      if (!project) {
        return {
          text: 'No target project is selected. Use `/droid use <project>` first.',
          backend: command.route.backend,
        };
      }
      session.currentProjectId = project.projectId;
      const roomId = command.kind === 'task-message'
        ? (command.taskId ?? 'operator')
        : 'operator';
      const target: SlackMirrorTarget = {
        channelId: user.channelId ?? 'unknown-channel',
        threadTs: command.kind === 'task-message' ? user.threadTs : undefined,
      };
      ensureMirrorSubscription(project, roomId, target, config, dependencies);

      const content = command.content?.trim();
      if (!content) {
        return {
          text: 'Slack relay message content is empty.',
          projectId: project.projectId,
          backend: command.route.backend,
        };
      }

      const directStatus = sendViaSubscription(project, roomId, {
        username: user.username,
        content,
      });
      const dispatchStatus = directStatus === 'offline'
        ? await dependencies.dispatchMessage({
          username: user.username,
          roomId,
          project,
          operatorToken: config.operatorToken ?? undefined,
          taskId: roomId === 'operator' ? undefined : roomId,
          messageType: 'chat',
          payload: {
            content,
            audience: roomId === 'operator' ? 'orchestrator' : 'task',
          },
        })
        : directStatus;

      appendSlackAudit('SLACK_MESSAGE_FORWARDED', {
        userId: user.userId,
        username: user.username,
        roomId,
        taskId: command.taskId,
        dispatchStatus,
        projectId: project.projectId,
      }, project);

      return {
        text: roomId === 'operator'
          ? `Forwarded to the orchestrator for *${project.name}* (${dispatchStatus}).`
          : `Forwarded to task \`${roomId}\` for *${project.name}* (${dispatchStatus}).`,
        projectId: project.projectId,
        backend: command.route.backend,
      };
    }
  }
};

export const handleSlackInput = async (
  input: {
    text: string;
    userId: string;
    username: string;
    channelId?: string;
    threadTs?: string;
  },
  config: SlackBotRuntimeConfig,
  dependencies?: Partial<SlackBotDependencies>,
): Promise<SlackIntentResult> => {
  const command = parseSlackIntent(input.text, {
    preferAppleIntelligence: config.preferAppleIntelligence,
    appleRuntimeAvailable: config.appleRuntimeAvailable,
    mlxAvailable: config.mlxAvailable,
    platform: process.platform,
    arch: process.arch,
  });
  const mergedDependencies: SlackBotDependencies = {
    dispatchMessage: dependencies?.dispatchMessage ?? defaultDispatchMessage,
    postSlackMessage: dependencies?.postSlackMessage ?? (async () => undefined),
    socketFactory: dependencies?.socketFactory ?? defaultSocketFactory,
  };
  try {
    return await executeSlackIntent(command, {
      userId: input.userId,
      username: input.username,
      channelId: input.channelId,
      threadTs: input.threadTs,
    }, config, mergedDependencies);
  } catch (error) {
    const project = resolveProjectForCommand(command, input.userId, config.defaultProjectId);
    appendSlackAudit('SLACK_COMMAND_FAILED', {
      userId: input.userId,
      username: input.username,
      kind: command.kind,
      error: error instanceof Error ? error.message : String(error),
    }, project);
    return {
      text: `Slack relay failed: ${error instanceof Error ? error.message : String(error)}`,
      projectId: project?.projectId,
      backend: command.route.backend,
    };
  }
};
