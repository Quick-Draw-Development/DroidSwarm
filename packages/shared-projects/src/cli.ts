import * as path from 'node:path';

import {
  detectProjectMetadata,
  getCurrentProject,
  listRegisteredProjects,
  migrateLegacyProject,
  onboardProject,
  removeRegisteredProject,
  resolveProjectLookup,
  setCurrentProject,
} from './index';

const command = process.argv[2];
const args = process.argv.slice(3);

const readValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
};

const output = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

switch (command) {
  case 'onboard': {
    const projectRoot = path.resolve(readValue('--project-root') ?? process.cwd());
    const metadata = detectProjectMetadata(projectRoot);
    const explicitId = readValue('--project-id');
    const projectId = explicitId
      ?? metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      ?? 'droidswarm-project';
    const record = onboardProject({
      projectId,
      name: readValue('--project-name') ?? metadata.name,
      rootPath: metadata.rootPath,
      gitRemote: metadata.gitRemote,
      gitCommitHash: metadata.gitCommitHash,
      dbPath: readValue('--db-path') ?? metadata.dbPath,
    });
    if (!args.includes('--no-select')) {
      setCurrentProject(record.projectId);
    }
    output(record);
    break;
  }
  case 'list':
    output(listRegisteredProjects());
    break;
  case 'status': {
    const lookup = readValue('--project') ?? readValue('--project-id') ?? readValue('--project-root');
    output(resolveProjectLookup(lookup) ?? null);
    break;
  }
  case 'select': {
    const lookup = readValue('--project') ?? readValue('--project-id') ?? readValue('--project-root');
    const project = resolveProjectLookup(lookup);
    if (!project) {
      throw new Error(`Unknown project: ${lookup ?? '(current)'}`);
    }
    output({
      project,
      selection: setCurrentProject(project.projectId),
    });
    break;
  }
  case 'current':
    output(getCurrentProject() ?? null);
    break;
  case 'remove': {
    const lookup = readValue('--project') ?? readValue('--project-id') ?? readValue('--project-root');
    const project = resolveProjectLookup(lookup);
    if (!project) {
      throw new Error(`Unknown project: ${lookup ?? '(missing)'}`);
    }
    output({
      projectId: project.projectId,
      removed: removeRegisteredProject(project.projectId),
    });
    break;
  }
  case 'migrate': {
    const projectRoot = path.resolve(readValue('--project-root') ?? process.cwd());
    output(migrateLegacyProject(projectRoot, {
      projectId: readValue('--project-id'),
      name: readValue('--project-name'),
      dbPath: readValue('--db-path'),
    }));
    break;
  }
  default:
    throw new Error(`Unknown shared-projects cli command: ${command ?? '(missing)'}`);
}
