var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var OrchestratorClient_exports = {};
__export(OrchestratorClient_exports, {
  DroidSwarmOrchestratorClient: () => DroidSwarmOrchestratorClient
});
module.exports = __toCommonJS(OrchestratorClient_exports);
var import_node_path = __toESM(require("node:path"));
var import_AgentSupervisor = require("./AgentSupervisor");
var import_config = require("./config");
var import_OrchestratorEngine = require("./engine/OrchestratorEngine");
var import_OperatorActionService = require("./operator/OperatorActionService");
var import_OperatorChatResponder = require("./operator/OperatorChatResponder");
var import_worker_registry = require("./worker-registry");
var import_TaskScheduler = require("./scheduler/TaskScheduler");
var import_SocketGateway = require("./socket/SocketGateway");
var import_database = require("./persistence/database");
var import_repositories = require("./persistence/repositories");
var import_service = require("./persistence/service");
var import_run_lifecycle = require("./run-lifecycle");
var import_run_shutdown = require("./run-shutdown");
var import_ToolService = require("./tools/ToolService");
var import_project_registry = require("./services/project-registry.service");
class DroidSwarmOrchestratorClient {
  constructor(config = (0, import_config.loadConfig)()) {
    this.config = config;
    this.registry = new import_worker_registry.WorkerRegistry();
    this.prefix = "[OrchestratorClient]";
    this.database = (0, import_database.openPersistenceDatabase)(this.config.dbPath);
    this.persistence = import_repositories.PersistenceClient.fromDatabase(this.database);
    this.runLifecycle = new import_run_lifecycle.RunLifecycleService(this.persistence);
    this.gateway = new import_SocketGateway.SocketGateway(this.config);
    this.supervisor = new import_AgentSupervisor.AgentSupervisor(
      config,
      this.registry,
      this.config.workerHostEntry ?? import_node_path.default.resolve(process.cwd(), "dist", "apps", "worker-host", "main.cjs")
    );
  }
  start() {
    this.log("starting orchestrator", {
      projectId: this.config.projectId,
      projectRoot: this.config.projectRoot,
      dbPath: this.config.dbPath,
      socketUrl: this.config.socketUrl
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
          repo_id: this.config.repoId
        }
      });
      this.log("created run", this.currentRun.runId);
    } else {
      if (activeRuns.length > 1) {
        this.log("multiple active runs detected", activeRuns.map((run) => run.runId));
      }
      this.currentRun = activeRuns[0];
      this.log("resuming run", this.currentRun.runId);
    }
    this.runLifecycle.startRun(this.currentRun);
    this.persistenceService = new import_service.OrchestratorPersistenceService(this.persistence, this.currentRun);
    new import_project_registry.ProjectRegistryService(this.persistenceService).registerProject({
      projectId: this.config.projectId,
      name: this.config.projectName,
      repo: {
        repoId: this.config.repoId,
        name: this.config.projectName,
        rootPath: this.config.projectRoot,
        defaultBranch: this.config.defaultBranch,
        mainBranch: this.config.gitPolicy.mainBranch,
        developBranch: this.config.gitPolicy.developBranch,
        allowedRoots: this.config.allowedRepoRoots
      }
    });
    this.scheduler = new import_TaskScheduler.TaskScheduler(this.persistenceService, this.supervisor, this.config);
    const toolService = new import_ToolService.ToolService(this.config, this.persistenceService);
    this.engine = new import_OrchestratorEngine.OrchestratorEngine({
      config: this.config,
      persistenceService: this.persistenceService,
      scheduler: this.scheduler,
      supervisor: this.supervisor,
      gateway: this.gateway,
      chatResponder: new import_OperatorChatResponder.OperatorChatResponder(this.config),
      controlService: new import_OperatorActionService.OperatorActionService(this.persistenceService, this.supervisor),
      registry: this.registry,
      runLifecycle: this.runLifecycle,
      toolService
    });
    this.scheduler.setEvents({
      onPlanProposed: this.engine.onPlanProposed,
      onCheckpointCreated: this.engine.onCheckpointCreated,
      onVerificationRequested: this.engine.onVerificationRequested,
      onVerificationOutcome: this.engine.onVerificationOutcome
    });
    this.supervisor.setCallbacks({
      onAgentsAssigned: this.engine.handleAgentAssignment.bind(this.engine),
      onAgentCommunication: this.engine.handleAgentCommunication.bind(this.engine)
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
        "recovery summary",
        recoveredSummaries.map((summary) => ({
          run: summary.runId,
          resumed: summary.resumedTasks.length,
          failed: summary.failedTasks.length
        }))
      );
    }
    this.log("run ready", this.currentRun.runId);
    this.gateway.start();
  }
  stop() {
    if (this.currentRun) {
      (0, import_run_shutdown.finalizeRunOnShutdown)(this.persistence, this.runLifecycle, this.currentRun.runId);
    }
    this.gateway.stop();
    this.database.close();
  }
  log(...args) {
    if (!this.config.debug) {
      return;
    }
    console.log(this.prefix, ...args);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DroidSwarmOrchestratorClient
});
