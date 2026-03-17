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
var import_task_registry = require("./task-registry");
var import_TaskScheduler = require("./scheduler/TaskScheduler");
var import_SocketGateway = require("./socket/SocketGateway");
var import_database = require("./persistence/database");
var import_repositories = require("./persistence/repositories");
var import_service = require("./persistence/service");
class DroidSwarmOrchestratorClient {
  constructor(config = (0, import_config.loadConfig)()) {
    this.config = config;
    this.registry = new import_task_registry.TaskRegistry();
    this.prefix = "[OrchestratorClient]";
    this.database = (0, import_database.openPersistenceDatabase)(this.config.dbPath);
    this.persistence = import_repositories.PersistenceClient.fromDatabase(this.database);
    this.gateway = new import_SocketGateway.SocketGateway(this.config);
    this.supervisor = new import_AgentSupervisor.AgentSupervisor(
      config,
      this.registry,
      import_node_path.default.resolve(__dirname, "main.js")
    );
  }
  start() {
    this.log("starting orchestrator");
    this.currentRun = this.persistence.createRun(this.config.projectId);
    this.persistenceService = new import_service.OrchestratorPersistenceService(this.persistence, this.currentRun);
    this.scheduler = new import_TaskScheduler.TaskScheduler(this.persistenceService, this.supervisor, this.config);
    this.engine = new import_OrchestratorEngine.OrchestratorEngine({
      config: this.config,
      persistenceService: this.persistenceService,
      scheduler: this.scheduler,
      supervisor: this.supervisor,
      gateway: this.gateway,
      chatResponder: new import_OperatorChatResponder.OperatorChatResponder(this.config),
      controlService: new import_OperatorActionService.OperatorActionService(this.persistenceService, this.supervisor),
      registry: this.registry
    });
    this.scheduler.setEvents({
      onPlanProposed: this.engine.onPlanProposed,
      onCheckpointCreated: this.engine.onCheckpointCreated,
      onVerificationRequested: this.engine.onVerificationRequested,
      onVerificationOutcome: this.engine.onVerificationOutcome
    });
    this.supervisor.setCallbacks({
      onAgentsAssigned: this.engine.handleAgentAssignment.bind(this.engine),
      onAgentCommunication: this.engine.handleAgentCommunication.bind(this.engine),
      onAgentResult: this.scheduler.handleAgentResult.bind(this.scheduler)
    });
    this.gateway.setMessageHandler(this.engine.handleMessage.bind(this.engine));
    this.log("created run", this.currentRun.runId);
    this.gateway.start();
  }
  stop() {
    this.gateway.stop();
    this.database.close();
  }
  log(...args) {
    console.log(this.prefix, ...args);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DroidSwarmOrchestratorClient
});
