import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

import { loadConfig } from './config';
import { buildAgentPrompt } from './agent-prompt';
import type { WorkerRequest } from '@shared-workers';
import {
  buildArtifactCreatedMessage,
  buildAgentStatusUpdate,
  buildClarificationRequest,
  buildSpawnRequestedMessage,
  buildAgentToolResponseMessage,
} from './messages';
import { buildAuthMessage, parseEnvelope } from './protocol';
import type { MessageEnvelope, TaskRecord, TaskScope, WorkerEngine, WorkerHeartbeat, WorkerResult } from './types';
import { CompressionShape, StatusUpdatePayload, ToolResponsePayload, UsageShape } from '@protocol';
import { LocalLlamaAdapter } from './adapters/worker/local-llama.adapter';
import { CodexCloudAdapter } from './adapters/worker/codex-cloud.adapter';
import { CodexCliAdapter } from './adapters/worker/codex-cli.adapter';
import { MuxWorkerAdapter } from './adapters/worker/mux-worker.adapter';

interface WorkerOptions {
  task: TaskRecord;
  role: string;
  agentName: string;
  attemptId: string;
  parentSummary?: string;
  parentDroidspeak?: string;
  model?: string;
  engine?: WorkerEngine;
  scope?: TaskScope;
  skillPacks?: string[];
  skillTexts?: string[];
  readOnly?: boolean;
  instructions?: string;
  workspacePath?: string;
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
        const statusCode = message.payload.hasOwnProperty('status_code') && typeof (message.payload as StatusUpdatePayload).status_code === 'string' ? (message.payload as StatusUpdatePayload).status_code : '';
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

const buildHeartbeatPayload = (heartbeat: WorkerHeartbeat): Record<string, unknown> => ({
  heartbeat,
  result: undefined,
});

const resolveScope = (config: ReturnType<typeof loadConfig>, options: WorkerOptions): TaskScope => ({
  projectId: options.scope?.projectId ?? options.task.projectId ?? config.projectId,
  repoId: options.scope?.repoId ?? options.task.repoId ?? config.repoId,
  rootPath: options.workspacePath ?? options.scope?.rootPath ?? options.task.rootPath ?? config.projectRoot,
  branch: options.scope?.branch ?? options.task.branchName ?? config.defaultBranch,
  workspaceId: options.scope?.workspaceId ?? options.task.workspaceId,
});

const getAdapter = (config: ReturnType<typeof loadConfig>, engine: WorkerEngine, workspacePath: string) => {
  switch (engine) {
    case 'local-llama':
      return new LocalLlamaAdapter({ baseUrl: config.llamaBaseUrl, timeoutMs: config.llamaTimeoutMs });
    case 'codex-cloud':
      return new CodexCloudAdapter({
        apiBaseUrl: config.codexApiBaseUrl,
        apiKey: config.codexApiKey,
        model: config.codexCloudModel,
      });
    case 'codex-cli':
      return new CodexCliAdapter({
        config,
        projectRoot: workspacePath,
      });
    case 'mux-local':
      return new MuxWorkerAdapter({
        command: process.env.DROIDSWARM_MUX_WORKER_CMD ?? process.execPath,
        args: process.env.DROIDSWARM_MUX_WORKER_ARGS ? process.env.DROIDSWARM_MUX_WORKER_ARGS.split(' ') : ['-e', 'console.log(process.argv.slice(1).join(" "))'],
        cwd: workspacePath,
      });
    default:
      return new LocalLlamaAdapter({ baseUrl: config.llamaBaseUrl, timeoutMs: config.llamaTimeoutMs });
  }
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
  console.log(`[Worker ${options.agentName}] authenticated for ${options.role} on ${options.task.taskId}`);

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

  console.log(`[Worker ${options.agentName}] notifying orchestrator of start`);

  const promptContent = options.instructions ?? buildAgentPrompt({
    task: options.task,
    role: options.role,
    agentName: options.agentName,
    parentSummary: options.parentSummary,
    parentDroidspeak: options.parentDroidspeak,
    projectId: config.projectId,
    projectName: config.projectName,
    specRules: config.agentRules,
    specDroidspeak: config.droidspeakRules,
  });
  const scope = resolveScope(config, options);
  const engine = options.engine ?? 'local-llama';
  const modelOverride = options.model
    ?? (engine === 'local-llama' ? config.llamaModel : engine === 'codex-cloud' ? config.codexCloudModel : config.codexModel);
  const reportLLMCall = (payload: ToolResponsePayload, usage?: UsageShape): void => {
    sendMessage(
      socket,
      buildAgentToolResponseMessage(
        config,
        options.task.taskId,
        options.task.taskId,
        options.agentName,
        payload,
        usage,
      ),
    );
  };

  const llmStart = Date.now();
  const heartbeatInterval = setInterval(() => {
    const heartbeat: WorkerHeartbeat = {
      runId: options.task.taskId,
      taskId: options.task.taskId,
      attemptId: options.attemptId,
      engine,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - llmStart,
      status: 'running',
      lastActivity: `running ${options.role}`,
    };
    sendMessage(
      socket,
      buildAgentStatusUpdate(
        config,
        options.task.taskId,
        options.task.taskId,
        options.agentName,
        'execution',
        'agent_heartbeat',
        `Heartbeat from ${options.agentName}`,
        undefined,
        buildHeartbeatPayload(heartbeat),
      ),
    );
  }, Math.max(1000, Math.floor(config.heartbeatMs / 2)));

  let result: WorkerResult;
  try {
    console.log(`[Worker ${options.agentName}] launching ${engine} adapter (${options.role})`);
    const adapter = getAdapter(config, engine, scope.rootPath);
    const request: WorkerRequest = {
      runId: options.task.taskId,
      taskId: options.task.taskId,
      attemptId: options.attemptId,
      role: options.role,
      instructions: promptContent,
      scope,
      engine,
      model: modelOverride,
      skillPacks: options.skillPacks,
      readOnly: options.readOnly,
      context: {
        parentSummary: options.parentSummary,
        parentCheckpoint: options.parentDroidspeak,
        resumePacket: options.skillTexts?.join('\n\n'),
      },
    };
    result = await adapter.run(request);
  } catch (error) {
    const latencyMs = Date.now() - llmStart;
    reportLLMCall({
      request_id: randomUUID(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Codex execution failed.',
      result: {
        tool_name: 'codex_agent',
        prompt: promptContent,
        latency_ms: latencyMs,
        model: modelOverride ?? 'codex_agent',
        error: error instanceof Error ? error.message : 'Codex execution failed.',
      },
    });
    const errorResult: WorkerResult = {
      success: false,
      engine: 'codex-cloud',
      model: modelOverride,
      summary: error instanceof Error ? error.message : 'Codex execution failed.',
      timedOut: false,
      durationMs: latencyMs,
      activity: {
        filesRead: [],
        filesChanged: [],
        commandsRun: [],
        toolCalls: [],
      },
      checkpointDelta: {
        factsAdded: [],
        decisionsAdded: [],
        openQuestions: [],
        risksFound: ['codex_exec_failed'],
        nextBestActions: [],
        evidenceRefs: [],
      },
      artifacts: [],
      spawnRequests: [],
      budget: {},
      metadata: {
        reasonCode: 'codex_exec_failed',
      },
    };
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
        undefined,
        { result: errorResult },
      ),
    );
    socket.close();
    return;
  } finally {
    clearInterval(heartbeatInterval);
  }

  const latencyMs = Date.now() - llmStart;
  const usage: UsageShape = {};
  if (result.budget.tokensOut !== undefined) {
    usage.total_tokens = result.budget.tokensOut;
    usage.output_tokens = result.budget.tokensOut;
  }
  const usagePayload: UsageShape | undefined = Object.keys(usage).length > 0 ? usage : undefined;
  reportLLMCall(
    {
      request_id: randomUUID(),
      status: 'success',
      result: {
        tool_name: 'codex_agent',
        prompt: promptContent,
        output: result.summary,
        tokens: result.budget.tokensOut,
        tool_calls: result.activity.toolCalls.length,
        latency_ms: latencyMs,
        duration_ms: result.durationMs || latencyMs,
        model: modelOverride ?? 'codex_agent',
      },
    },
    usagePayload,
  );

  console.log(`[Worker ${options.agentName}] Codex completed with success=${result.success}`);

  for (const artifact of result.artifacts) {
    sendMessage(
      socket,
      buildArtifactCreatedMessage(config, options.task.taskId, options.task.taskId, options.agentName, artifact),
    );
  }

  for (const request of result.spawnRequests) {
    const normalizedRequest = {
      role: request.role,
      reason: request.reason,
      instructions: request.instructions ?? request.reason,
    };
    sendMessage(
      socket,
      buildSpawnRequestedMessage(config, options.task.taskId, options.task.taskId, options.agentName, normalizedRequest),
    );
  }

  const clarificationQuestion = typeof result.metadata?.clarificationQuestion === 'string'
    ? result.metadata.clarificationQuestion
    : result.checkpointDelta.openQuestions[0];
  if (clarificationQuestion) {
    sendMessage(
      socket,
      buildClarificationRequest(
        config,
        options.task.taskId,
        options.task.taskId,
        options.task.createdByUserId,
        clarificationQuestion,
      ),
    );
  }

  const compression = typeof result.metadata?.compression === 'object' && result.metadata.compression !== null
    ? result.metadata.compression as CompressionShape
    : undefined;

  sendMessage(
    socket,
    buildAgentStatusUpdate(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      'execution',
      result.success ? 'agent_completed' : 'agent_blocked',
      result.summary,
      compression,
      { result },
    ),
  );
  socket.close();
};

if (require.main === module) {
  void runWorker();
}
