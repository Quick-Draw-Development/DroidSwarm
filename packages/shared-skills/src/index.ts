import fs from 'node:fs';
import path from 'node:path';

export interface SkillPack {
  name: string;
  instructions: string;
  filePath: string;
}

export const loadSkillPack = (rootDir: string, name: string): SkillPack | null => {
  const filePath = path.join(rootDir, name, 'SKILL.md');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return {
    name,
    instructions: fs.readFileSync(filePath, 'utf8'),
    filePath,
  };
};

export const loadSkillPacks = (rootDir: string, names: string[]): SkillPack[] =>
  names.map((name) => loadSkillPack(rootDir, name)).filter((skill): skill is SkillPack => skill !== null);
