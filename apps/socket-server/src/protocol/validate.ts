import { authMessageSchema, normalizeEnvelopeV2, type AuthMessage, type MessageEnvelope, type MessageType } from '@protocol';

export const parseAuthMessage = (input: string): AuthMessage => authMessageSchema.parse(JSON.parse(input));

export const parseMessageEnvelope = (input: string): MessageEnvelope => normalizeEnvelopeV2(JSON.parse(input));

export const isOperatorOnlyMessage = (type: MessageType): boolean =>
  type === 'task_created' || type === 'task_intake_accepted';
