var import_src = require("../../../packages/protocol-alias/src/index");
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
const bootstrapWorker = (mode2) => {
  if (mode2 === "worker") {
    const { runWorker } = require("./worker");
    void runWorker();
  } else {
    const { runVerifier } = require("./verifier");
    void runVerifier();
  }
};
const mode = process.argv[2];
if (mode === "worker") {
  bootstrapWorker("worker");
} else if (mode === "verifier") {
  bootstrapWorker("verifier");
} else {
  startOrchestrator();
}
