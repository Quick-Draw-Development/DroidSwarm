import { DroidSwarmOrchestratorClient } from './OrchestratorClient';

if (process.argv[2] === 'worker') {
  require('./worker');
} else {
  const orchestrator = new DroidSwarmOrchestratorClient();

  const shutdown = (): void => {
    orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  orchestrator.start();
}
