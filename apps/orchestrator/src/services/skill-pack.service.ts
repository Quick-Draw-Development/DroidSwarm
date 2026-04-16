import path from 'node:path';

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
    const normalized = role.toLowerCase();
    if (normalized.includes('plan')) {
      return ['planner'];
    }
    if (normalized.includes('research')) {
      return ['researcher'];
    }
    if (normalized.includes('review')) {
      return ['reviewer'];
    }
    if (normalized.includes('bug')) {
      return ['bugfix'];
    }
    if (normalized.includes('feature') || normalized.includes('code') || normalized.includes('dev')) {
      return ['feature'];
    }
    return ['orchestrator'];
  }
}
