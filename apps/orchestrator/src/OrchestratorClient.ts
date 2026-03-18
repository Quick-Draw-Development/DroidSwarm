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
      path.resolve(__dirname, 'main.js'),
    );
  }

  start(): void {
    this.log('starting orchestrator');
    this.runLifecycle.recoverInterruptedRuns();
    const activeRuns = this.persistence.runs.listActiveRuns();
    if (activeRuns.length === 0) {
      this.currentRun = this.persistence.createRun(this.config.projectId);
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
    this.scheduler = new TaskScheduler(this.persistenceService, this.supervisor, this.config);

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
    this.gateway.start();
  }

  stop(): void {
    if (this.currentRun) {
      finalizeRunOnShutdown(this.persistence, this.runLifecycle, this.currentRun.runId);
    }
    this.gateway.stop();
    this.database.close();
  }

  private log(...args: unknown[]): void {
    console.log(this.prefix, ...args);
  }
}
