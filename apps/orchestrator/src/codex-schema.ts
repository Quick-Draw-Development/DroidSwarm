export const codexAgentOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'requested_agents', 'artifacts', 'doc_updates', 'branch_actions'],
  properties: {
    status: {
      type: 'string',
      enum: ['completed', 'blocked', 'needs_help'],
    },
    summary: {
      type: 'string',
      minLength: 1,
    },
    requested_agents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'reason', 'instructions'],
        properties: {
          role: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 },
          instructions: { type: 'string', minLength: 1 },
        },
      },
    },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'content'],
        properties: {
          kind: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          content: { type: 'string', minLength: 1 },
        },
      },
    },
    doc_updates: {
      type: 'array',
      items: { type: 'string' },
    },
    branch_actions: {
      type: 'array',
      items: { type: 'string' },
    },
    clarification_question: {
      type: 'string',
    },
    reason_code: {
      type: 'string',
    },
    compression: {
      type: 'object',
      additionalProperties: false,
      required: ['scheme', 'compressed_content'],
      properties: {
        scheme: {
          type: 'string',
          const: 'droidspeak-v1',
        },
        compressed_content: {
          type: 'string',
          minLength: 1,
        },
      },
    },
  },
} as const;
