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
  agentName: 'Orchestrator',
  agentRole: 'control-plane',
  socketUrl: 'ws://localhost:8765',
  heartbeatMs: 100,
  reconnectMs: 100,
  codexBin: 'codex',
  codexSandboxMode: 'workspace-write',
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
    default: 'o1-preview',
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
});
