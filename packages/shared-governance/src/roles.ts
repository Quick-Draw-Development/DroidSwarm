import { listRegisteredAgentsByConsensusRole } from '@shared-projects';

export const GOVERNANCE_ROLES = [
  'proposer',
  'reviewer',
  'verifier',
  'guardian',
  'arbitrator',
] as const;

export type GovernanceConsensusRole = (typeof GOVERNANCE_ROLES)[number];

export interface GovernanceRoleDefinition {
  id: GovernanceConsensusRole;
  title: string;
  responsibility: string;
}

export const GOVERNANCE_ROLE_DEFINITIONS: GovernanceRoleDefinition[] = [
  {
    id: 'proposer',
    title: 'PROPOSER',
    responsibility: 'Initiates the action and states the intended outcome.',
  },
  {
    id: 'reviewer',
    title: 'REVIEWER',
    responsibility: 'Presents arguments for and against the proposed action.',
  },
  {
    id: 'verifier',
    title: 'VERIFIER',
    responsibility: 'Checks the action against active law and operational facts.',
  },
  {
    id: 'guardian',
    title: 'GUARDIAN',
    responsibility: 'Vetoes actions that would violate law, safety, or federation integrity.',
  },
  {
    id: 'arbitrator',
    title: 'ARBITRATOR',
    responsibility: 'Breaks ties and emits the final lightweight consensus outcome.',
  },
];

export const listGovernanceRoles = (): GovernanceRoleDefinition[] => [...GOVERNANCE_ROLE_DEFINITIONS];

export const resolveConsensusAgentsForRole = (role: GovernanceConsensusRole): string[] => {
  const registered = listRegisteredAgentsByConsensusRole(role)
    .filter((entry) => entry.status === 'active')
    .map((entry) => entry.name);
  if (registered.length > 0) {
    return registered;
  }
  switch (role) {
    case 'proposer':
      return ['planner'];
    case 'reviewer':
      return ['reviewer'];
    case 'verifier':
      return ['verifier'];
    case 'guardian':
      return ['guardian'];
    case 'arbitrator':
      return ['arbiter'];
  }
};
