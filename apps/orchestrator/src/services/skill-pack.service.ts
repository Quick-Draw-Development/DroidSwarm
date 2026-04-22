import path from 'node:path';

import { getSwarmRoleDefinition } from '@shared-routing';
import { loadSkillPacks } from '@shared-skills';
import type { OrchestratorConfig } from '../types';

export class SkillPackService {
  private readonly skillsRoot: string;

  constructor(private readonly config: OrchestratorConfig) {
    this.skillsRoot = path.resolve(this.config.projectRoot, 'skills');
  }

  resolve(role: string, requested: string[] = []): string[] {
    const inferred = this.inferRoleSkills(role);
    const names = [...new Set([...requested, ...inferred])];
    return loadSkillPacks(this.skillsRoot, names).map((skill) => skill.instructions);
  }

  resolveNames(role: string, requested: string[] = []): string[] {
    return [...new Set([...requested, ...this.inferRoleSkills(role)])];
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
