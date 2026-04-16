import type { RepoTarget } from '../types';
import { assertScopeWithinRepo } from '@shared-projects';
import type { OrchestratorPersistenceService } from '../persistence/service';

export class ProjectRegistryService {
  constructor(private readonly persistence: OrchestratorPersistenceService) {}

  registerProject(input: {
    projectId: string;
    name: string;
    description?: string;
    repo: {
      repoId: string;
      name: string;
      rootPath: string;
      defaultBranch: string;
      mainBranch: string;
      developBranch: string;
      allowedRoots: string[];
    };
  }): void {
    this.persistence.upsertProject({
      projectId: input.projectId,
      name: input.name,
      description: input.description,
    });
    this.persistence.upsertProjectRepo({
      projectId: input.projectId,
      ...input.repo,
    });
  }

  validateRepoScope(scope: {
    projectId: string;
    repoId: string;
    rootPath: string;
    branch: string;
    workspaceId?: string;
  }, repo: RepoTarget): void {
    assertScopeWithinRepo(scope, repo);
  }
}
