import WebSocket from 'ws';

import { loadConfig } from './config';
import { buildAgentPrompt } from './agent-prompt';
import { runCodexPrompt } from './codex-runner';
import {
  buildAgentArtifactMessage,
  buildAgentRequestHelp,
  buildAgentStatusUpdate,
  buildClarificationRequest,
} from './messages';
import { buildAuthMessage, parseEnvelope } from './protocol';
import type { CodexAgentResult, MessageEnvelope, OrchestratorConfig, TaskRecord } from './types';

interface WorkerOptions {
  task: TaskRecord;
  role: string;
  agentName: string;
  parentSummary?: string;
  parentDroidspeak?: string;
}

const parseOptions = (): WorkerOptions => {
  const raw = process.argv[3];
  if (!raw) {
    throw new Error('Missing worker payload.');
  }

  return JSON.parse(raw) as WorkerOptions;
};

const waitForSocketOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.on('open', () => resolve());
    socket.on('error', reject);
  });

const waitForAuthReady = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for agent auth confirmation.'));
    }, 2_000);

    socket.on('message', (raw) => {
      try {
        const message = parseEnvelope(raw.toString());
        const statusCode = typeof message.payload.status_code === 'string' ? message.payload.status_code : '';
        if (message.type === 'status_update' && statusCode === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        // ignore unrelated messages
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

const sendMessage = (socket: WebSocket, message: MessageEnvelope | ReturnType<typeof buildAuthMessage>): void => {
  socket.send(JSON.stringify(message));
};

const runWorker = async (): Promise<void> => {
  const config = loadConfig();
  const options = parseOptions();
  const socket = new WebSocket(config.socketUrl);

  await waitForSocketOpen(socket);
  sendMessage(socket, {
    ...buildAuthMessage(config),
    payload: {
      room_id: options.task.taskId,
      agent_name: options.agentName,
      agent_role: options.role,
      client_type: 'agent',
    },
  });

  await waitForAuthReady(socket);

  sendMessage(
    socket,
    buildAgentStatusUpdate(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      'execution',
      'agent_started',
      `${options.agentName} started ${options.role} work.`,
    ),
  );

  let result: CodexAgentResult;
  try {
    result = await runCodexPrompt({
      config,
      projectRoot: config.projectRoot,
      prompt: buildAgentPrompt({
        task: options.task,
        role: options.role,
        agentName: options.agentName,
        parentSummary: options.parentSummary,
        parentDroidspeak: options.parentDroidspeak,
        projectId: config.projectId,
        projectName: config.projectName,
        specRules: config.agentRules,
        specDroidspeak: config.droidspeakRules,
      }),
    });
  } catch (error) {
    sendMessage(
      socket,
      buildAgentStatusUpdate(
        config,
        options.task.taskId,
        options.task.taskId,
        options.agentName,
        'execution',
        'agent_failed',
        error instanceof Error ? error.message : 'Codex execution failed.',
      ),
    );

    if (process.send) {
      process.send({
        type: 'agent_result',
        taskId: options.task.taskId,
        agentName: options.agentName,
        role: options.role,
        result: {
          status: 'blocked',
          summary: error instanceof Error ? error.message : 'Codex execution failed.',
          requested_agents: [],
          artifacts: [],
          doc_updates: [],
          branch_actions: [],
          reason_code: 'codex_exec_failed',
        } satisfies CodexAgentResult,
      });
    }
    socket.close();
    return;
  }

  for (const artifact of result.artifacts) {
    sendMessage(socket, buildAgentArtifactMessage(config, options.task.taskId, options.task.taskId, options.agentName, artifact));
  }

  for (const request of result.requested_agents) {
    sendMessage(socket, buildAgentRequestHelp(config, options.task.taskId, options.task.taskId, options.agentName, request));
  }

  if (result.clarification_question) {
    sendMessage(
      socket,
      buildClarificationRequest(
        config,
        options.task.taskId,
        options.task.taskId,
        options.task.createdByUserId,
        result.clarification_question,
      ),
    );
  }

  sendMessage(
    socket,
    buildAgentStatusUpdate(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      'execution',
      result.status === 'completed' ? 'agent_completed' : 'agent_blocked',
      result.summary,
      result.compression,
    ),
  );

  if (process.send) {
    process.send({
      type: 'agent_result',
      taskId: options.task.taskId,
      agentName: options.agentName,
      role: options.role,
      result,
    });
  }

  socket.close();
};

void runWorker();
