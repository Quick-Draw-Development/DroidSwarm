import { authMessageSchema, messageEnvelopeSchema, type AuthMessage, type MessageEnvelope, type MessageType } from '@protocol/index';

export const parseAuthMessage = (input: string): AuthMessage => authMessageSchema.parse(JSON.parse(input));

export const parseMessageEnvelope = (input: string): MessageEnvelope => messageEnvelopeSchema.parse(JSON.parse(input));

export const isOperatorOnlyMessage = (type: MessageType): boolean =>
  type === 'task_created' || type === 'task_intake_accepted';
