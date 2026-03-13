import { z } from 'zod';

import { ACTOR_TYPES, CLIENT_TYPES, MESSAGE_TYPES, type AuthMessage, type MessageEnvelope, type MessageType } from '../types';

const isoTimestampSchema = z.string().datetime({ offset: true });

const compressionSchema = z.object({
  scheme: z.string().min(1),
  compressed_content: z.string().min(1),
});

const usageSchema = z.object({
  total_tokens: z.number().int().nonnegative().optional(),
  input_tokens: z.number().int().nonnegative().optional(),
  cached_input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  reasoning_output_tokens: z.number().int().nonnegative().optional(),
});

const actorRefSchema = z.object({
  actor_type: z.enum(ACTOR_TYPES),
  actor_id: z.string().min(1),
  actor_name: z.string().min(1),
});

const nonAuthMessageTypes = MESSAGE_TYPES.filter((messageType) => messageType !== 'auth') as [Exclude<MessageType, 'auth'>, ...Exclude<MessageType, 'auth'>[]];

const authPayloadSchema = z.object({
  room_id: z.string().min(1),
  agent_name: z.string().min(1),
  agent_role: z.string().min(1),
  client_type: z.enum(CLIENT_TYPES).optional(),
  token: z.string().min(1).optional(),
});

export const authMessageSchema = z.object({
  type: z.literal('auth'),
  project_id: z.string().min(1),
  timestamp: isoTimestampSchema,
  payload: authPayloadSchema,
});

export const messageEnvelopeSchema = z.object({
  message_id: z.string().min(1),
  project_id: z.string().min(1),
  room_id: z.string().min(1),
  task_id: z.string().min(1).optional(),
  type: z.enum(nonAuthMessageTypes),
  from: actorRefSchema,
  timestamp: isoTimestampSchema,
  payload: z.record(z.string(), z.unknown()),
  reply_to: z.string().min(1).optional(),
  trace_id: z.string().min(1).optional(),
  span_id: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
  usage: usageSchema.optional(),
  compression: compressionSchema.optional(),
});

export const parseAuthMessage = (input: string): AuthMessage => authMessageSchema.parse(JSON.parse(input));

export const parseMessageEnvelope = (input: string): MessageEnvelope => messageEnvelopeSchema.parse(JSON.parse(input));

export const isOperatorOnlyMessage = (type: MessageType): boolean =>
  type === 'task_created' || type === 'task_intake_accepted';
