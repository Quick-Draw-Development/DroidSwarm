import path from 'node:path';

import { AgentSupervisor } from './AgentSupervisor';
import { loadConfig } from './config';
import { OrchestratorEngine } from './engine/OrchestratorEngine';
import { OperatorActionService } from './operator/OperatorActionService';
import { OperatorChatResponder } from './operator/OperatorChatResponder';
import { WorkerRegistry } from './worker-registry';
import { TaskScheduler } from './scheduler/TaskScheduler';
import { SocketGateway } from './socket/SocketGateway';
import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import { OrchestratorPersistenceService } from './persistence/service';
import { RunLifecycleService } from './run-lifecycle';
import type { Database } from 'better-sqlite3';
import type { OrchestratorConfig, RunRecord } from './types';
import { finalizeRunOnShutdown } from './run-shutdown';
import { ToolService } from './tools/ToolService';
import { ProjectRegistryService } from './services/project-registry.service';
import type { PersistedTask, TaskRecord } from './types';

export class DroidSwarmOrchestratorClient {
  private readonly registry = new WorkerRegistry();
  private readonly supervisor: AgentSupervisor;
  private readonly gateway: SocketGateway;
  private readonly database: Database;
  private readonly persistence: PersistenceClient;
  private readonly runLifecycle: RunLifecycleService;
  private readonly prefix = '[OrchestratorClient]';
  private scheduler?: TaskScheduler;
  private currentRun?: RunRecord;
  private persistenceService?: OrchestratorPersistenceService;
  private engine?: OrchestratorEngine;

  constructor(private readonly config: OrchestratorConfig = loadConfig()) {
    this.database = openPersistenceDatabase(this.config.dbPath);
    this.persistence = PersistenceClient.fromDatabase(this.database);
    this.runLifecycle = new RunLifecycleService(this.persistence);
    this.gateway = new SocketGateway(this.config);
    this.supervisor = new AgentSupervisor(
      config,
      this.registry,
      this.config.workerHostEntry ?? path.resolve(process.cwd(), 'dist', 'apps', 'worker-host', 'main.js'),
    );
  }

  start(): void {
    this.log('starting orchestrator', {
      projectId: this.config.projectId,
      projectRoot: this.config.projectRoot,
      dbPath: this.config.dbPath,
      socketUrl: this.config.socketUrl,
    });
    this.runLifecycle.recoverInterruptedRuns();
    const activeRuns = this.persistence.runs.listActiveRuns();
    if (activeRuns.length === 0) {
      this.currentRun = this.persistence.createRun(this.config.projectId, {
        repoId: this.config.repoId,
        rootPath: this.config.projectRoot,
        branch: this.config.defaultBranch,
        metadata: {
          project_id: this.config.projectId,
          repo_id: this.config.repoId,
        },
      });
      this.log('created run', this.currentRun.runId);
    } else {
      if (activeRuns.length > 1) {
        this.log('multiple active runs detected', activeRuns.map((run) => run.runId));
      }
      this.currentRun = activeRuns[0];
      this.log('resuming run', this.currentRun.runId);
    }
    this.runLifecycle.startRun(this.currentRun);
    this.persistenceService = new OrchestratorPersistenceService(this.persistence, this.currentRun);
    new ProjectRegistryService(this.persistenceService).registerProject({
      projectId: this.config.projectId,
      name: this.config.projectName,
      repo: {
        repoId: this.config.repoId,
        name: this.config.projectName,
        rootPath: this.config.projectRoot,
        defaultBranch: this.config.defaultBranch,
        mainBranch: this.config.gitPolicy.mainBranch,
        developBranch: this.config.gitPolicy.developBranch,
        allowedRoots: this.config.allowedRepoRoots,
      },
    });
    this.scheduler = new TaskScheduler(this.persistenceService, this.supervisor, this.config);
    const toolService = new ToolService(this.config, this.persistenceService);

    this.engine = new OrchestratorEngine({
      config: this.config,
      persistenceService: this.persistenceService,
      scheduler: this.scheduler,
      supervisor: this.supervisor,
      gateway: this.gateway,
      chatResponder: new OperatorChatResponder(this.config),
      controlService: new OperatorActionService(this.persistenceService, this.supervisor),
      registry: this.registry,
      runLifecycle: this.runLifecycle,
      toolService,
    });

    this.scheduler.setEvents({
      onPlanProposed: this.engine.onPlanProposed,
      onCheckpointCreated: this.engine.onCheckpointCreated,
      onVerificationRequested: this.engine.onVerificationRequested,
      onVerificationOutcome: this.engine.onVerificationOutcome,
    });

    this.supervisor.setCallbacks({
      onAgentsAssigned: this.engine.handleAgentAssignment.bind(this.engine),
      onAgentCommunication: this.engine.handleAgentCommunication.bind(this.engine),
    });

    this.gateway.setMessageHandler(this.engine.handleMessage.bind(this.engine));
    this.gateway.start();

    this.hydrateExistingTasks();

    const recoveredSummaries = this.runLifecycle.getRecoverySummaries();
    for (const summary of recoveredSummaries) {
      for (const taskId of summary.resumedTasks) {
        this.scheduler.handleNewTask(taskId);
      }
    }
    if (recoveredSummaries.length > 0) {
      this.log(
        'recovery summary',
        recoveredSummaries.map((summary) => ({
          run: summary.runId,
          resumed: summary.resumedTasks.length,
          failed: summary.failedTasks.length,
        })),
      );
    }

    this.log('run ready', this.currentRun.runId);
  }

  stop(): void {
    if (this.currentRun) {
      finalizeRunOnShutdown(this.persistence, this.runLifecycle, this.currentRun.runId);
    }
    this.gateway.stop();
    this.database.close();
  }

  private log(...args: unknown[]): void {
    if (!this.config.debug) {
      return;
    }
    console.log(this.prefix, ...args);
  }

  private toTaskRecord(task: PersistedTask): TaskRecord {
    return {
      taskId: task.taskId,
      projectId: task.projectId,
      repoId: task.repoId,
      rootPath: task.rootPath,
      workspaceId: task.workspaceId,
      title: task.name,
      description: typeof task.metadata?.description === 'string' ? task.metadata.description : '',
      taskType: typeof task.metadata?.task_type === 'string' ? task.metadata.task_type : 'task',
      priority: task.priority,
      createdAt: task.createdAt,
      createdByUserId: typeof task.metadata?.created_by === 'string' ? task.metadata.created_by : undefined,
      branchName: typeof task.metadata?.branch_name === 'string' ? task.metadata.branch_name : undefined,
    };
  }

  private hydrateExistingTasks(): void {
    const tasks = this.persistenceService?.getTasks() ?? [];
    for (const task of tasks) {
      this.registry.register(this.toTaskRecord(task));
      if (this.shouldWatchTaskChannel(task)) {
        this.gateway.watchTaskChannel(task.taskId);
      }
    }
  }

  private shouldWatchTaskChannel(task: PersistedTask): boolean {
    return !['completed', 'failed', 'cancelled', 'verified'].includes(task.status);
  }
}
