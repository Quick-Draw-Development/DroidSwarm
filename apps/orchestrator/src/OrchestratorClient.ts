import path from 'node:path';

import { AgentSupervisor } from './AgentSupervisor';
import { loadConfig } from './config';
import { OrchestratorEngine } from './engine/OrchestratorEngine';
import { OperatorCommandHandler } from './operator/OperatorCommandHandler';
import { TaskRegistry } from './task-registry';
import { TaskScheduler } from './scheduler/TaskScheduler';
import { SocketGateway } from './socket/SocketGateway';
import { openPersistenceDatabase } from './persistence/database';
import { PersistenceClient } from './persistence/repositories';
import { OrchestratorPersistenceService } from './persistence/service';
import type { Database } from 'better-sqlite3';
import type { OrchestratorConfig, RunRecord } from './types';

export class DroidSwarmOrchestratorClient {
  private readonly registry = new TaskRegistry();
  private readonly supervisor: AgentSupervisor;
  private readonly gateway: SocketGateway;
  private readonly database: Database;
  private readonly persistence: PersistenceClient;
  private readonly prefix = '[OrchestratorClient]';
  private scheduler?: TaskScheduler;
  private currentRun?: RunRecord;
  private persistenceService?: OrchestratorPersistenceService;
  private engine?: OrchestratorEngine;

  constructor(private readonly config: OrchestratorConfig = loadConfig()) {
    this.database = openPersistenceDatabase(this.config.dbPath);
    this.persistence = PersistenceClient.fromDatabase(this.database);
    this.gateway = new SocketGateway(this.config);
    this.supervisor = new AgentSupervisor(
      config,
      this.registry,
      path.resolve(__dirname, 'main.js'),
    );
  }

  start(): void {
    this.log('starting orchestrator');
    this.currentRun = this.persistence.createRun(this.config.projectId);
    this.persistenceService = new OrchestratorPersistenceService(this.persistence, this.currentRun);
    this.scheduler = new TaskScheduler(this.persistenceService, this.supervisor, this.config);

    this.engine = new OrchestratorEngine({
      config: this.config,
      persistenceService: this.persistenceService,
      scheduler: this.scheduler,
      supervisor: this.supervisor,
      gateway: this.gateway,
      commandHandler: new OperatorCommandHandler(this.config),
      registry: this.registry,
    });

    this.scheduler.setEvents({
      onPlanProposed: this.engine.handlePlanProposed,
      onCheckpointCreated: this.engine.handleCheckpointCreated,
      onVerificationRequested: this.engine.handleVerificationRequested,
    });

    this.supervisor.setCallbacks({
      onAgentsAssigned: this.engine.handleAgentAssignment.bind(this.engine),
      onAgentCommunication: this.engine.handleAgentCommunication.bind(this.engine),
      onAgentResult: this.scheduler.handleAgentResult.bind(this.scheduler),
    });

    this.gateway.setMessageHandler(this.engine.handleMessage.bind(this.engine));

    this.log('created run', this.currentRun.runId);
    this.gateway.start();
  }

  stop(): void {
    this.gateway.stop();
    this.database.close();
  }

  private log(...args: unknown[]): void {
    console.log(this.prefix, ...args);
  }
}
