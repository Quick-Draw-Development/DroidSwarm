'use strict';

import { spawn } from 'node:child_process';

import WebSocket from 'ws';

import { loadConfig } from './config';
import { buildAgentStatusUpdate, buildArtifactCreatedMessage } from './messages';
import { buildAuthMessage, parseEnvelope } from './protocol';
import type { TaskRecord, WorkerResult } from './types';

interface VerifierOptions {
  task: TaskRecord;
  role: string;
  agentName: string;
  parentSummary?: string;
  parentDroidspeak?: string;
}

type NxCommand = {
  label: string;
  args: string[];
};

type NxCommandResult = NxCommand & {
  exitCode: number | null;
  output: string;
};

const NX_COMMANDS: NxCommand[] = [
  { label: 'nx lint orchestrator', args: ['nx', 'lint', 'orchestrator'] },
  { label: 'nx typecheck dashboard', args: ['nx', 'typecheck', 'dashboard'] },
  { label: 'nx test orchestrator', args: ['nx', 'test', 'orchestrator'] },
  { label: 'nx test socket-server', args: ['nx', 'test', 'socket-server'] },
  { label: 'nx build orchestrator', args: ['nx', 'build', 'orchestrator'] },
  { label: 'nx build socket-server', args: ['nx', 'build', 'socket-server'] },
  { label: 'nx build protocol', args: ['nx', 'build', 'protocol'] },
  { label: 'nx build protocol-alias', args: ['nx', 'build', 'protocol-alias'] },
];

const MAX_LOG_LENGTH = 16_384;

const parseOptions = (): VerifierOptions => {
  const raw = process.argv[3];
  if (!raw) {
    throw new Error('Verifier mode requires worker payload.');
  }
  return JSON.parse(raw) as VerifierOptions;
};

const waitForSocketOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.on('open', () => resolve());
    socket.on('error', reject);
  });

const waitForAuthReady = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for verifier auth confirmation.'));
    }, 2_000);

    socket.on('message', (raw) => {
      try {
        const message = parseEnvelope(raw.toString());
        if (message.type === 'status_update' && typeof message.payload.status_code === 'string' && message.payload.status_code === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        // ignore parse failures
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

const sendMessage = (socket: WebSocket, payload: unknown): void => {
  socket.send(JSON.stringify(payload));
};

const runNxCommand = (config: ReturnType<typeof loadConfig>, command: NxCommand): Promise<NxCommandResult> =>
  new Promise((resolve) => {
    const processRef = spawn('npx', command.args, {
      cwd: config.projectRoot,
      env: process.env,
    });

    let output = '';

    processRef.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });
    processRef.stderr?.on('data', (chunk) => {
      output += chunk.toString();
    });

    processRef.on('error', (error) => {
      output += `\n${error.message}`;
      resolve({
        ...command,
        exitCode: 1,
        output,
      });
    });

    processRef.on('close', (code) => {
      resolve({
        ...command,
        exitCode: code,
        output,
      });
    });
  });

const trimLog = (input: string): string => {
  if (input.length <= MAX_LOG_LENGTH) {
    return input;
  }
  return `${input.slice(0, MAX_LOG_LENGTH)}\n...log truncated`;
};

export const runVerifier = async (): Promise<void> => {
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
  console.log(`[Verifier ${options.agentName}] authenticated on ${options.task.taskId}`);

  sendMessage(
    socket,
    buildAgentStatusUpdate(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      'verification',
      'agent_started',
      `${options.agentName} started verification work.`,
    ),
  );

  const commandResults: NxCommandResult[] = [];
  for (const command of NX_COMMANDS) {
    console.log(`[Verifier ${options.agentName}] running ${command.label}`);
    const result = await runNxCommand(config, command);
    commandResults.push(result);
    const artifactContent = `Exit code: ${result.exitCode}\n${result.output}`;
    sendMessage(
      socket,
      buildArtifactCreatedMessage(config, options.task.taskId, options.task.taskId, options.agentName, {
        kind: 'verification_log',
        summary: `${command.label} ${result.exitCode === 0 ? 'passed' : 'failed'}`,
        content: trimLog(artifactContent),
      }),
    );
  }

  const failedCommands = commandResults.filter((result) => result.exitCode !== 0);
  const summary = failedCommands.length === 0
    ? 'Verifier droid completed lint/test/build without errors.'
    : `Verifier detected problems in ${failedCommands.map((command) => command.label).join(', ')}.`;
  const statusCode = failedCommands.length === 0 ? 'agent_completed' : 'agent_failed';
  const finalResult: WorkerResult = {
    success: failedCommands.length === 0,
    engine: 'codex-cli',
    summary,
    timedOut: false,
    durationMs: 0,
    activity: {
      filesRead: [],
      filesChanged: [],
      commandsRun: commandResults.map((result) => result.label),
      toolCalls: [],
    },
    checkpointDelta: {
      factsAdded: [],
      decisionsAdded: [],
      openQuestions: [],
      risksFound: failedCommands.length === 0 ? [] : ['nx_verification_failed'],
      nextBestActions: [],
      evidenceRefs: [],
    },
    artifacts: commandResults.map((result) => ({
      kind: 'nx_command_summary',
      summary: result.label,
      content: trimLog(`code=${result.exitCode} output:\n${result.output}`),
    })),
    spawnRequests: [],
    budget: {},
    metadata: failedCommands.length === 0 ? undefined : { reasonCode: 'nx_verification_failed' },
  };

  sendMessage(
    socket,
    buildAgentStatusUpdate(
      config,
      options.task.taskId,
      options.task.taskId,
      options.agentName,
      'verification',
      statusCode,
      summary,
      undefined,
      {
        result: finalResult,
      },
    ),
  );

  socket.close();
};

if (require.main === module) {
  runVerifier().catch((error) => {
    console.error('Verifier failed', error);
    process.exit(1);
  });
}
