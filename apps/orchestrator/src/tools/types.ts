import type { ToolName } from '@protocol';

export interface ToolRequest {
  requestId: string;
  taskId: string;
  toolName: ToolName;
  parameters?: Record<string, unknown>;
  agentName: string;
}

export interface ToolResponse {
  status: 'success' | 'error';
  result?: Record<string, unknown>;
  error?: string;
}
