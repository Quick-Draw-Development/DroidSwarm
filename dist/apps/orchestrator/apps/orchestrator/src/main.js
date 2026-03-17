var import_OrchestratorClient = require("./OrchestratorClient");
if (process.argv[2] === "worker") {
  require("./worker");
} else {
  const orchestrator = new import_OrchestratorClient.DroidSwarmOrchestratorClient();
  const shutdown = () => {
    orchestrator.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  orchestrator.start();
}
