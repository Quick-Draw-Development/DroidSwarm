var import_protocol_alias = require("@protocol-alias/index");
var import_OrchestratorClient = require("./OrchestratorClient");
const startOrchestrator = () => {
  const orchestrator = new import_OrchestratorClient.DroidSwarmOrchestratorClient();
  const shutdown = () => {
    orchestrator.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  orchestrator.start();
};
const bootstrapWorker = () => {
  require("./worker");
};
const isWorkerMode = process.argv[2] === "worker";
if (isWorkerMode) {
  bootstrapWorker();
} else {
  startOrchestrator();
}
