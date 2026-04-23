import type { ServerConfig, AuthResult } from '../types';

import { type AuthMessage } from '../types';

export class AuthenticationError extends Error {
  constructor(message: string, readonly reasonCode: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export const authenticateClient = (config: ServerConfig, message: AuthMessage): AuthResult => {
  const allowedProjectIds = new Set([
    config.projectId,
    ...(config.allowedProjectIds ?? []),
  ]);
  if (!allowedProjectIds.has(message.project_id)) {
    throw new AuthenticationError('Project mismatch', 'project_mismatch');
  }

  const roomId = message.payload.room_id;
  const clientType = message.payload.client_type ?? 'agent';
  const privileged = roomId === 'operator' || clientType === 'orchestrator' || clientType === 'dashboard' || clientType === 'system';

  if (roomId === 'operator' && config.operatorToken && message.payload.token !== config.operatorToken) {
    throw new AuthenticationError('Privileged token required for operator room', 'operator_token_required');
  }

  if (roomId === 'operator' && !privileged) {
    throw new AuthenticationError('Operator room requires a privileged client type', 'operator_room_forbidden');
  }

  const actorType = clientType === 'dashboard' ? 'human' : clientType;

  return {
    roomId,
    agentName: message.payload.agent_name,
    agentRole: message.payload.agent_role,
    clientType,
    actorType,
    privileged,
  };
};
