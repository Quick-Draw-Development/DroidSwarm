export interface TraceContext {
  traceId: string;
  spanId?: string;
  workflowName?: string;
}

export const buildTraceContext = (workflowName: string): TraceContext => ({
  traceId: `${workflowName}-${Date.now()}`,
  workflowName,
});
