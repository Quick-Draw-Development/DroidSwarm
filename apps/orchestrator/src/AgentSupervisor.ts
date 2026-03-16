import { randomUUID } from 'node:crypto';
import { ChildProcess, fork } from 'node:child_process';

import { TaskRegistry } from './task-registry';
import type {
  CodexAgentResult,
  OrchestratorConfig,
  RequestedAgent,
  SpawnedAgent,
  TaskRecord,
} from './types';
import { formatAgentRequestContent } from './operator-notifications';

interface AgentResultMessage {
  type: 'agent_result';
  taskId: string;
  agentName: string;
  role: string;
  result: CodexAgentResult;
}

interface AgentSupervisorCallbacks {
  onAgentsAssigned?: (taskId: string, agents: SpawnedAgent[]) => void;
  onAgentCommunication?: (taskId: string, message: string) => void;
  onAgentResult?: (
    taskId: string,
    attemptId: string,
    agentName: string,
    role: string,
    result: CodexAgentResult,
  ) => void;
}

interface ActiveAgent {
  child: ChildProcess;
  taskId: string;
  agentName: string;
  role: string;
  attemptId: string;
}

export const defaultRoleInstructions = (task: TaskRecord): RequestedAgent[] => {
  const normalizedType = task.taskType.toLowerCase();
  if (normalizedType === 'bug') {
    return [{
      role: 'coder-backend',
      reason: 'bug-triage',
      instructions: `Investigate and fix the reported bug in task ${task.taskId}.`,
    }];
  }

  return [{
    role: 'planner',
    reason: 'initial-planning',
    instructions: `Plan the work for task ${task.taskId}, propose next roles, and identify blockers.`,
  }];
};

export class AgentSupervisor {
  private readonly agents = new Map<string, ActiveAgent>();
  private readonly roleCounters = new Map<string, number>();
  private callbacks: AgentSupervisorCallbacks;

  constructor(
    private readonly config: OrchestratorConfig,
    private readonly registry: TaskRegistry,
    private readonly entryScript: string,
    callbacks: AgentSupervisorCallbacks = {},
  ) {
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: Partial<AgentSupervisorCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  startAgentForTask(
    task: TaskRecord,
    role: string,
    attemptId: string,
    parentSummary?: string,
    parentDroidspeak?: string,
  ): SpawnedAgent | null {
    if (!this.canSpawn(task)) {
      return null;
    }

    const agentName = this.nextAgentName(role);
    const child = fork(this.entryScript, ['worker', JSON.stringify({
      task,
      role,
      agentName,
      parentSummary,
      parentDroidspeak,
    })], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      text
        .split(/\\r?\\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          console.log('[AgentSupervisor]', agentName, 'stdout:', line);
        });
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      text
        .split(/\\r?\\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          console.error('[AgentSupervisor]', agentName, 'stderr:', line);
        });
    });

    const agent: ActiveAgent = {
      child,
      taskId: task.taskId,
      agentName,
      role,
      attemptId,
    };
    this.agents.set(agentName, agent);
    const currentNames = this.registry.get(task.taskId)?.activeAgents ?? [];
    this.registry.assignAgents(task.taskId, [...currentNames, agentName]);

    child.on('message', (message) => {
      this.handleAgentMessage(task, message as AgentResultMessage);
    });

    child.on('exit', () => {
      this.registry.removeAgent(task.taskId, agentName);
      this.agents.delete(agentName);
    });

    const spawned: SpawnedAgent = {
      agentName,
      taskId: task.taskId,
      role,
      attemptId,
    };
    this.callbacks.onAgentsAssigned?.(task.taskId, [spawned]);
    return spawned;
  }

  cancelTask(taskId: string): string[] {
    const removedAgents = [...this.registry.get(taskId)?.activeAgents ?? []];

    for (const agentName of removedAgents) {
      const agent = this.agents.get(agentName);
      if (!agent) {
        continue;
      }
      agent.child.kill('SIGTERM');
      this.agents.delete(agentName);
    }

    this.registry.cancel(taskId, new Date().toISOString());
    return removedAgents;
  }

  getActiveAgentCount(): number {
    return this.agents.size;
  }

  countActiveAgents(predicate?: (agent: ActiveAgent) => boolean): number {
    if (!predicate) {
      return this.agents.size;
    }

    let count = 0;
    for (const agent of this.agents.values()) {
      if (predicate(agent)) {
        count += 1;
      }
    }

    return count;
  }

  private handleAgentMessage(task: TaskRecord, message: AgentResultMessage): void {
    if (message.type !== 'agent_result' || message.taskId !== task.taskId) {
      return;
    }

    const taskState = this.registry.get(task.taskId);
    if (!taskState || taskState.status === 'cancelled') {
      return;
    }

    const agent = this.agents.get(message.agentName);
    const attemptId = agent?.attemptId ?? '';

    if (message.result.requested_agents.length > 0) {
      this.callbacks.onAgentCommunication?.(
        task.taskId,
        formatAgentRequestContent(message.agentName, message.result.requested_agents),
      );
    }

    this.callbacks.onAgentResult?.(
      task.taskId,
      attemptId,
      message.agentName,
      message.role,
      message.result,
    );
  }

  private canSpawn(task: TaskRecord): boolean {
    const taskState = this.registry.get(task.taskId);
    const activeCount = taskState?.activeAgents.length ?? 0;
    const availableTaskSlots = Math.max(0, this.config.maxAgentsPerTask - activeCount);
    const availableGlobalSlots = Math.max(0, this.config.maxConcurrentAgents - this.agents.size);
    return availableTaskSlots > 0 && availableGlobalSlots > 0;
  }

  private nextAgentName(role: string): string {
    const prefix = role
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('-') || 'Agent';

    const nextValue = (this.roleCounters.get(prefix) ?? 0) + 1;
    this.roleCounters.set(prefix, nextValue);
    return `${prefix}-${String(nextValue).padStart(2, '0')}-${randomUUID().slice(0, 4)}`;
  }
}
