var import_src = require("../../../packages/protocol-alias/src/index");
var import_shared_models = require("@shared-models");
var import_shared_agent_brain = require("@shared-agent-brain");
var import_shared_memory = require("@shared-memory");
var import_shared_skills = require("@shared-skills");
var import_shared_tracing = require("@shared-tracing");
var import_OrchestratorClient = require("./OrchestratorClient");
const startOrchestrator = () => {
  const orchestrator = (0, import_shared_tracing.instrumentOrchestrator)(new import_OrchestratorClient.DroidSwarmOrchestratorClient());
  const stopModelDiscovery = (0, import_shared_models.startModelDiscoveryLoop)({
    projectId: process.env.DROIDSWARM_PROJECT_ID
  });
  const hermesEnabled = process.env.DROIDSWARM_ENABLE_HERMES_LOOP === "true" || process.env.DROIDSWARM_ENABLE_HERMES_LOOP === "1";
  const brainEnabled = process.env.DROIDSWARM_ENABLE_AGENTIC_BRAIN === "true" || process.env.DROIDSWARM_ENABLE_AGENTIC_BRAIN === "1";
  const reflectionTimer = hermesEnabled ? setInterval(() => {
    void Promise.resolve().then(() => {
      (0, import_shared_memory.runReflectionCycle)({ projectId: process.env.DROIDSWARM_PROJECT_ID });
      (0, import_shared_memory.pruneLongTermMemories)({ maxPerProject: 500 });
    }).catch(() => void 0);
  }, 45 * 60 * 1e3) : void 0;
  const dreamTimer = brainEnabled ? setInterval(() => {
    void Promise.resolve().then(() => {
      (0, import_shared_agent_brain.runBrainDreamCycle)({ projectId: process.env.DROIDSWARM_PROJECT_ID });
      try {
        (0, import_shared_skills.proposeSkillRewrite)({
          projectId: process.env.DROIDSWARM_PROJECT_ID,
          proposedBy: "agentic-brain"
        });
      } catch {
      }
    }).catch(() => void 0);
  }, 24 * 60 * 60 * 1e3) : void 0;
  const shutdown = () => {
    import_shared_tracing.tracer.audit("ORCHESTRATOR_SIGNAL_STOP", {
      signal: "shutdown"
    });
    stopModelDiscovery();
    if (reflectionTimer) {
      clearInterval(reflectionTimer);
    }
    if (dreamTimer) {
      clearInterval(dreamTimer);
    }
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
