import { randomUUID } from 'node:crypto';

import { tracer } from '@shared-tracing';

import type { PersistencePort } from '../types';

export const writeAuditEvent = (
  persistence: PersistencePort,
  input: {
    projectId: string;
    taskId?: string;
    channelId?: string;
    connectionId?: string;
    traceId?: string;
    eventType: string;
    actorType?: string;
    actorId?: string;
    details?: Record<string, unknown>;
  },
): void => {
  tracer.audit('SOCKET_AUDIT_EVENT', {
    projectId: input.projectId,
    taskId: input.taskId,
    channelId: input.channelId,
    connectionId: input.connectionId,
    traceId: input.traceId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    details: input.details,
  });
  persistence.recordAuditEvent({
    auditEventId: randomUUID(),
    projectId: input.projectId,
    taskId: input.taskId,
    channelId: input.channelId,
    connectionId: input.connectionId,
    traceId: input.traceId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    details: input.details,
    createdAt: new Date().toISOString(),
  });
};
