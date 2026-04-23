import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  CodexAgentResult,
  MessageEnvelope,
  OrchestratorConfig,
} from '../types';
import type { StatusUpdatePayload } from '@protocol';
import { OrchestratorEngine } from './OrchestratorEngine';
import { WorkerRegistry } from '../worker-registry';
import type { OrchestratorPersistenceService } from '../persistence/service';
import type { TaskScheduler } from '../scheduler/TaskScheduler';
import { ToolService } from '../tools/ToolService';

const TEST_CONFIG: OrchestratorConfig = {
  environment: 'test',
  projectId: 'droidswarm',
  projectName: 'DroidSwarm',
  projectRoot: '/',
  repoId: 'droidswarm-repo',
  defaultBranch: 'main',
  developBranch: 'develop',
  allowedRepoRoots: ['/'],
  workspaceRoot: '/tmp/droidswarm-workspaces',
  agentName: 'Orchestrator',
  agentRole: 'control-plane',
  socketUrl: 'ws://localhost:8765',
  heartbeatMs: 100,
  reconnectMs: 100,
  codexBin: 'codex',
  codexCloudModel: 'gpt-5-codex',
  codexApiBaseUrl: 'https://api.openai.com/v1',
  codexApiKey: 'test-key',
  codexSandboxMode: 'workspace-write',
  llamaBaseUrl: 'http://127.0.0.1:11434',
  llamaModel: 'llama',
  llamaTimeoutMs: 1000,
  prAutomationEnabled: false,
  prRemoteName: 'origin',
  gitPolicy: {
    mainBranch: 'main',
    developBranch: 'develop',
    prefixes: {
      feature: 'feature/',
      hotfix: 'hotfix/',
      release: 'release/',
      support: 'support/',
    },
  },
  maxAgentsPerTask: 2,
  maxConcurrentAgents: 2,
  maxConcurrentCodeAgents: 1,
  specDir: '',
  orchestratorRules: '',
  droidspeakRules: '',
  agentRules: '',
  plannerRules: '',
  codingRules: '',
  dbPath: ':memory:',
  schedulerMaxTaskDepth: 4,
  schedulerMaxFanOut: 3,
  schedulerRetryIntervalMs: 250,
  sideEffectActionsBeforeReview: 0,
  allowedTools: [],
  modelRouting: {
    planning: 'o1-preview',
    verification: 'gpt-4o-mini',
    code: 'claude-3.5-sonnet',
    apple: 'apple-intelligence/local',
    default: 'o1-preview',
  },
  routingPolicy: {
    plannerRoles: ['plan', 'planner', 'research', 'review', 'orchestrator', 'checkpoint', 'compress'],
    appleRoles: ['apple', 'ios', 'macos', 'swift', 'swiftui', 'xcode', 'visionos'],
    appleTaskHints: ['apple', 'ios', 'ipad', 'iphone', 'macos', 'osx', 'swift', 'swiftui', 'objective-c', 'uikit', 'appkit', 'xcode', 'testflight', 'visionos', 'watchos', 'tvos'],
    codeHints: ['code', 'coder', 'dev', 'implementation', 'debug', 'refactor'],
    cloudEscalationHints: ['refactor', 'debug', 'multi-file', 'migration', 'large-scale'],
  },
  budgetMaxConsumed: undefined,
};

const toolServiceStub = {
  handleRequest: async () => ({
    status: 'error' as const,
    error: 'stubbed tool',
  }),
} as unknown as ToolService;

describe('OrchestratorEngine status handling', () => {
  it('fires scheduler and records events from status updates', async () => {
    const recordedEvents: string[] = [];
    const persistenceService = {
      recordExecutionEvent: (eventType: string) => {
        recordedEvents.push(eventType);
      },
      getLatestTaskStateDigest: () => undefined,
      getLatestHandoffPacket: () => undefined,
    } as unknown as OrchestratorPersistenceService;
    const schedulerCalls: Array<{
      taskId: string;
      attemptId: string;
      agentName: string;
      role: string;
      result: CodexAgentResult;
    }> = [];
    const scheduler = {
      handleAgentResult: (taskId: string, attemptId: string, agentName: string, role: string, result: CodexAgentResult) => {
        schedulerCalls.push({ taskId, attemptId, agentName, role, result });
      },
    } as unknown as TaskScheduler;

    const engine = new OrchestratorEngine({
      config: TEST_CONFIG,
      persistenceService,
      scheduler,
      supervisor: {} as any,
      gateway: {
        send: () => undefined,
        watchTaskChannel: () => undefined,
        setMessageHandler: () => undefined,
      } as any,
      chatResponder: {} as any,
      controlService: {} as any,
      registry: new WorkerRegistry(),
      runLifecycle: {} as any,
      toolService: toolServiceStub,
    });

    engine.handleAgentAssignment('task-1', [{
      agentName: 'Agent-1',
      taskId: 'task-1',
      role: 'coder',
      attemptId: 'attempt-1',
    }]);

    const agentResult: CodexAgentResult = {
      status: 'completed',
      summary: 'done',
      requested_agents: [],
      artifacts: [],
      doc_updates: [],
      branch_actions: [],
    };

    const message: MessageEnvelope<'status_update'> = {
      message_id: 'msg-1',
      project_id: TEST_CONFIG.projectId,
      room_id: 'task-1',
      task_id: 'task-1',
      type: 'status_update',
      from: {
        actor_type: 'agent',
        actor_id: 'Agent-1',
        actor_name: 'Agent-1',
      },
      timestamp: new Date().toISOString(),
      payload: {
        phase: 'execution',
        status_code: 'agent_completed',
        content: 'done',
        result: agentResult,
      } as StatusUpdatePayload & { result: CodexAgentResult },
    };

    await engine.handleMessage(message, 'task');
    assert.equal(recordedEvents[0], 'agent_result');
    assert.equal(schedulerCalls.length, 1);
    assert.equal(schedulerCalls[0].taskId, 'task-1');
    assert.equal(schedulerCalls[0].role, 'coder');
    assert.equal(schedulerCalls[0].result.summary, 'done');
  });

  it('records drift detection when federated hashes do not match persisted continuity state', async () => {
    const recordedEvents: Array<{ eventType: string; transportBody?: Record<string, unknown> }> = [];
    const persistenceService = {
      recordExecutionEvent: (eventType: string, _detail: string, _metadata?: Record<string, unknown>, transport?: { transportBody?: Record<string, unknown> }) => {
        recordedEvents.push({ eventType, transportBody: transport?.transportBody });
      },
      getLatestTaskStateDigest: () => ({ federationHash: 'digest-expected' }),
      getLatestHandoffPacket: () => ({ federationHash: 'handoff-expected' }),
    } as unknown as OrchestratorPersistenceService;
    const scheduler = {
      handleAgentResult: () => undefined,
    } as unknown as TaskScheduler;

    const engine = new OrchestratorEngine({
      config: TEST_CONFIG,
      persistenceService,
      scheduler,
      supervisor: {} as any,
      gateway: {
        send: () => undefined,
        watchTaskChannel: () => undefined,
        setMessageHandler: () => undefined,
      } as any,
      chatResponder: {} as any,
      controlService: {} as any,
      registry: new WorkerRegistry(),
      runLifecycle: {} as any,
      toolService: toolServiceStub,
    });

    engine.handleAgentAssignment('task-2', [{
      agentName: 'Agent-2',
      taskId: 'task-2',
      role: 'planner',
      attemptId: 'attempt-2',
    }]);

    const message: MessageEnvelope<'status_update'> = {
      message_id: 'msg-drift-1',
      project_id: TEST_CONFIG.projectId,
      room_id: 'task-2',
      task_id: 'task-2',
      type: 'status_update',
      from: {
        actor_type: 'agent',
        actor_id: 'Agent-2',
        actor_name: 'Agent-2',
      },
      timestamp: new Date().toISOString(),
      payload: {
        phase: 'execution',
        status_code: 'agent_completed',
        content: 'done',
        metadata: {
          federationNodeId: 'node-remote',
          digestHash: 'digest-remote',
          handoffHash: 'handoff-remote',
        },
        result: {
          status: 'completed',
          summary: 'done',
          requested_agents: [],
          artifacts: [],
          doc_updates: [],
          branch_actions: [],
        },
      } as StatusUpdatePayload & { result: CodexAgentResult },
    };

    await engine.handleMessage(message, 'task');
    assert.equal(recordedEvents[0]?.eventType, 'agent_result');
    assert.equal(recordedEvents[0]?.transportBody?.reportedDigestHash, 'digest-remote');
    assert.equal(recordedEvents[0]?.transportBody?.expectedDigestHash, 'digest-expected');
    assert.equal(recordedEvents[0]?.transportBody?.reportedHandoffHash, 'handoff-remote');
    assert.equal(recordedEvents[0]?.transportBody?.expectedHandoffHash, 'handoff-expected');
  });
});
