import { postToBus } from '@federation-bus';
import { appendAuditEvent } from '@shared-tracing';
import { validateCompliance } from '@shared-governance';

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
    this.interval = setInterval(() => this.runCheck(), 30_000);
    this.interval.unref?.();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private runCheck(): void {
    const report = validateCompliance({
      eventType: 'governance.compliance-check',
      actorRole: 'master',
      swarmRole: 'master',
      projectId: this.config.projectId,
      auditLoggingEnabled: true,
      dashboardEnabled: false,
    });
    appendAuditEvent('GOVERNANCE_COMPLIANCE_CHECK', {
      projectId: this.config.projectId,
      ok: report.ok,
      lawHash: report.lawHash,
      violations: report.laws.filter((entry) => !entry.ok),
    });
    if (this.config.federationEnabled && this.config.federationBusUrl) {
      void postToBus(this.config.federationBusUrl, {
        sourceNodeId: this.config.federationNodeId ?? this.config.projectId,
        envelope: {
          id: `gov-${Date.now()}`,
          ts: new Date().toISOString(),
          project_id: this.config.projectId,
          swarm_id: this.config.federationNodeId ?? this.config.projectId,
          room_id: 'operator',
          verb: 'status.updated',
          body: {
            metadata: {
              lawHash: report.lawHash,
              governanceOk: report.ok,
            },
          },
        },
      }, this.config.federationSigningKeyId && this.config.federationSigningPrivateKey
        ? {
          keyId: this.config.federationSigningKeyId,
          privateKeyPem: this.config.federationSigningPrivateKey,
        }
        : undefined).catch(() => undefined);
    }
  }
}
