import '../../../packages/protocol-alias/src/index';
import { startModelDiscoveryLoop } from '@shared-models';
import { instrumentOrchestrator, tracer } from '@shared-tracing';
import { DroidSwarmOrchestratorClient } from './OrchestratorClient';

const startOrchestrator = (): void => {
  const orchestrator = instrumentOrchestrator(new DroidSwarmOrchestratorClient());
  const stopModelDiscovery = startModelDiscoveryLoop({
    projectId: process.env.DROIDSWARM_PROJECT_ID,
  });
  const shutdown = (): void => {
    tracer.audit('ORCHESTRATOR_SIGNAL_STOP', {
      signal: 'shutdown',
    });
    stopModelDiscovery();
    orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  orchestrator.start();
};

const bootstrapWorker = (mode: 'worker' | 'verifier'): void => {
  if (mode === 'worker') {
    const { runWorker } = require('./worker') as typeof import('./worker');
    void runWorker();
  } else {
    const { runVerifier } = require('./verifier') as typeof import('./verifier');
    void runVerifier();
  }
};

const mode = process.argv[2];

if (mode === 'worker') {
  bootstrapWorker('worker');
} else if (mode === 'verifier') {
  bootstrapWorker('verifier');
} else {
  startOrchestrator();
}
