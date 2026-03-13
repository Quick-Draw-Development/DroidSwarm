import type { RequestedAgent, SpawnedAgent } from './types';

export const formatAgentAssignmentContent = (agents: SpawnedAgent[]): string => {
  if (agents.length === 0) {
    return 'Assigned agents: none.';
  }

  const details = agents.map((agent) => `${agent.agentName} (${agent.role})`).join(', ');
  return `Assigned agents: ${details}.`;
};

export const formatAgentRequestContent = (agentName: string, requests: RequestedAgent[]): string => {
  if (requests.length === 0) {
    return `${agentName} requested additional agents: none.`;
  }

  const requestDetails = requests
    .map((request) => `${request.role} (${request.reason})`)
    .join(', ');
  return `${agentName} requested additional agents: ${requestDetails}`;
};

export const buildReviewAnnouncement = (operatorName: string): string =>
  `${operatorName} is reviewing this task.`;
