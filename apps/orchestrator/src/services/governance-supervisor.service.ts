import { appendAuditEvent } from '@shared-tracing';
import { broadcastSystemStateHash } from '@shared-governance';
import { runComplianceCheck } from '@shared-governance';

import type { OrchestratorConfig } from '../types';

export class GovernanceSupervisorService {
  private interval?: NodeJS.Timeout;

  constructor(private readonly config: Pick<OrchestratorConfig,
    'governanceEnabled' | 'projectId' | 'federationEnabled' | 'federationBusUrl' | 'federationNodeId' | 'federationSigningKeyId' | 'federationSigningPrivateKey'>) {}

  start(): void {
    if (!this.config.governanceEnabled) {
      return;
    }
    this.runCheck();
    this.interval = setInterval(() => this.runCheck(), 60_000);
    this.interval.unref?.();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private runCheck(): void {
    const report = runComplianceCheck({
      eventType: 'governance.compliance-check',
      actorRole: 'master',
      swarmRole: 'master',
      projectId: this.config.projectId,
      auditLoggingEnabled: true,
      dashboardEnabled: false,
    });
    if (this.config.federationEnabled && this.config.federationBusUrl) {
      void broadcastSystemStateHash({
        busUrl: this.config.federationBusUrl,
        sourceNodeId: this.config.federationNodeId ?? this.config.projectId,
        projectId: this.config.projectId,
        signing: this.config.federationSigningKeyId && this.config.federationSigningPrivateKey
        ? {
          keyId: this.config.federationSigningKeyId,
          privateKeyPem: this.config.federationSigningPrivateKey,
        }
        : undefined,
      }).catch(() => undefined);
    }
    appendAuditEvent('GOVERNANCE_SUPERVISOR_TICK', {
      projectId: this.config.projectId,
      ok: report.ok,
      lawHash: report.lawHash,
    });
  }
}
