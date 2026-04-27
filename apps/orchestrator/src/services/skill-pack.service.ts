import path from 'node:path';

import { getSwarmRoleDefinition } from '@shared-routing';
import { loadSkillPacks, resolveAgentSkillPacks, syncDiscoveredAgents, syncDiscoveredSkills } from '@shared-skills';
import { tracer } from '@shared-tracing';
import type { OrchestratorConfig } from '../types';

export class SkillPackService {
  private readonly skillsRoot: string;

  constructor(private readonly config: OrchestratorConfig) {
    this.skillsRoot = path.resolve(this.config.projectRoot, 'skills');
    try {
      syncDiscoveredSkills(this.skillsRoot);
      syncDiscoveredAgents(this.skillsRoot);
    } catch (error) {
      tracer.warn('skills.registry.bootstrap_failed', {
        skillsRoot: this.skillsRoot,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  resolve(role: string, requested: string[] = []): string[] {
    const inferred = this.inferRoleSkills(role);
    const names = [...new Set([...requested, ...inferred])];
    return loadSkillPacks(this.skillsRoot, names).map((skill) => skill.instructions);
  }

  resolveNames(role: string, requested: string[] = []): string[] {
    const dynamicAgentSkills = (() => {
      try {
        return resolveAgentSkillPacks(role);
      } catch (error) {
        tracer.warn('skills.registry.resolve_failed', {
          role,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    })();
    return [...new Set([...requested, ...this.inferRoleSkills(role), ...dynamicAgentSkills])];
  }

  private inferRoleSkills(role: string): string[] {
    const normalized = getSwarmRoleDefinition(role).id;
    if (normalized === 'planner') {
      return ['planner'];
    }
    if (normalized === 'researcher' || normalized === 'repo-scanner') {
      return ['researcher'];
    }
    if (normalized === 'reviewer' || normalized === 'arbiter') {
      return ['reviewer'];
    }
    if (normalized === 'bugfix-helper') {
      return ['bugfix'];
    }
    if (normalized === 'implementation-helper' || normalized === 'apple-specialist') {
      return ['feature'];
    }
    if (normalized === 'summarizer' || normalized === 'checkpoint-compressor') {
      return ['planner'];
    }
    return ['orchestrator'];
  }
}
