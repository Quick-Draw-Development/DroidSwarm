import '../../../packages/protocol-alias/src/index';
import { DroidSwarmOrchestratorClient } from './OrchestratorClient';

const startOrchestrator = (): void => {
  const orchestrator = new DroidSwarmOrchestratorClient();
  const shutdown = (): void => {
    orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  orchestrator.start();
};

const bootstrapWorker = (): void => {
  require('./worker');
};

const isWorkerMode = process.argv[2] === 'worker';

if (isWorkerMode) {
  bootstrapWorker();
} else {
  startOrchestrator();
}
