import path from 'node:path';

import { appendAuditEvent } from '@shared-tracing';
import { syncDiscoveredAgents, syncDiscoveredSkills, watchSkillRegistry } from '@shared-skills';

import type { OrchestratorConfig } from '../types';

export class DynamicSkillRegistryService {
  private stopWatcher?: () => void;

  constructor(private readonly config: OrchestratorConfig) {}

  private resolveSkillsDir(): string {
    return this.config.skillsDir ?? path.resolve(this.config.projectRoot, 'skills');
  }

  start(): void {
    const skillsDir = this.resolveSkillsDir();
    const skills = syncDiscoveredSkills(skillsDir);
    const agents = syncDiscoveredAgents(skillsDir);
    try {
      appendAuditEvent('SKILL_REGISTRY_SYNC', {
        skillCount: skills.length,
        agentCount: agents.length,
        projectId: this.config.projectId,
      });
    } catch {
      // Tests and bootstrap probes may use ephemeral db paths; registry sync should remain non-fatal.
    }

    if (this.config.enableSkillWatch !== true) {
      return;
    }

    this.stopWatcher = watchSkillRegistry(skillsDir, ({ skills: count }) => {
      const syncedAgents = syncDiscoveredAgents(skillsDir);
      try {
        appendAuditEvent('SKILL_REGISTRY_RELOAD', {
          skillCount: count,
          agentCount: syncedAgents.length,
          projectId: this.config.projectId,
        });
      } catch {
        // Tests and bootstrap probes may use ephemeral db paths; registry sync should remain non-fatal.
      }
    });
  }

  stop(): void {
    this.stopWatcher?.();
  }
}
