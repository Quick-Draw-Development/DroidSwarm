import '../../../packages/protocol-alias/src/index';
import { startModelDiscoveryLoop } from '@shared-models';
import { runBrainDreamCycle } from '@shared-agent-brain';
import { pruneLongTermMemories, runReflectionCycle } from '@shared-memory';
import { proposeSkillRewrite } from '@shared-skills';
import { instrumentOrchestrator, tracer } from '@shared-tracing';
import { DroidSwarmOrchestratorClient } from './OrchestratorClient';

const startOrchestrator = (): void => {
  const orchestrator = instrumentOrchestrator(new DroidSwarmOrchestratorClient());
  const stopModelDiscovery = startModelDiscoveryLoop({
    projectId: process.env.DROIDSWARM_PROJECT_ID,
  });
  const hermesEnabled = process.env.DROIDSWARM_ENABLE_HERMES_LOOP === 'true'
    || process.env.DROIDSWARM_ENABLE_HERMES_LOOP === '1';
  const brainEnabled = process.env.DROIDSWARM_ENABLE_AGENTIC_BRAIN === 'true'
    || process.env.DROIDSWARM_ENABLE_AGENTIC_BRAIN === '1';
  const reflectionTimer = hermesEnabled
    ? setInterval(() => {
      void Promise.resolve().then(() => {
        runReflectionCycle({ projectId: process.env.DROIDSWARM_PROJECT_ID });
        pruneLongTermMemories({ maxPerProject: 500 });
      }).catch(() => undefined);
    }, 45 * 60 * 1000)
    : undefined;
  const dreamTimer = brainEnabled
    ? setInterval(() => {
      void Promise.resolve().then(() => {
        runBrainDreamCycle({ projectId: process.env.DROIDSWARM_PROJECT_ID });
        try {
          proposeSkillRewrite({
            projectId: process.env.DROIDSWARM_PROJECT_ID,
            proposedBy: 'agentic-brain',
          });
        } catch {
          // No rewrite candidates yet.
        }
      }).catch(() => undefined);
    }, 24 * 60 * 60 * 1000)
    : undefined;
  const shutdown = (): void => {
    tracer.audit('ORCHESTRATOR_SIGNAL_STOP', {
      signal: 'shutdown',
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
