import path from 'node:path';

import { syncDiscoveredAgents, syncDiscoveredSkills } from '@shared-skills';

import { WorkerRunner } from './worker-runner';

const skillsRoot = process.env.DROIDSWARM_SKILLS_DIR ?? path.resolve(process.cwd(), 'skills');
syncDiscoveredSkills(skillsRoot);
syncDiscoveredAgents(skillsRoot);

void new WorkerRunner().start();
