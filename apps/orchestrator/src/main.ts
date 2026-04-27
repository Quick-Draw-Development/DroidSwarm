import '../../../packages/protocol-alias/src/index';
import { startModelDiscoveryLoop } from '@shared-models';
import { pruneLongTermMemories, runReflectionCycle } from '@shared-memory';
import { instrumentOrchestrator, tracer } from '@shared-tracing';
import { DroidSwarmOrchestratorClient } from './OrchestratorClient';

const startOrchestrator = (): void => {
  const orchestrator = instrumentOrchestrator(new DroidSwarmOrchestratorClient());
  const stopModelDiscovery = startModelDiscoveryLoop({
    projectId: process.env.DROIDSWARM_PROJECT_ID,
  });
  const hermesEnabled = process.env.DROIDSWARM_ENABLE_HERMES_LOOP === 'true'
    || process.env.DROIDSWARM_ENABLE_HERMES_LOOP === '1';
  const reflectionTimer = hermesEnabled
    ? setInterval(() => {
      void Promise.resolve().then(() => {
        runReflectionCycle({ projectId: process.env.DROIDSWARM_PROJECT_ID });
        pruneLongTermMemories({ maxPerProject: 500 });
      }).catch(() => undefined);
    }, 45 * 60 * 1000)
    : undefined;
  const shutdown = (): void => {
    tracer.audit('ORCHESTRATOR_SIGNAL_STOP', {
      signal: 'shutdown',
    });
    stopModelDiscovery();
    if (reflectionTimer) {
      clearInterval(reflectionTimer);
    }
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
