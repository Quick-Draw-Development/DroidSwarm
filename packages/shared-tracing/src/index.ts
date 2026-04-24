import {
  appendAuditEvent,
  exportProof,
  getMerkleRoot,
  listAuditEvents,
  verifyChain,
} from './audit-logger';
import { computeFederationRulesHash, enforceLaws, LAW_001_MANIFEST } from './laws';

export interface TraceContext {
  traceId: string;
  spanId?: string;
  workflowName?: string;
}

export const buildTraceContext = (workflowName: string): TraceContext => ({
  traceId: `${workflowName}-${Date.now()}`,
  workflowName,
});

export {
  appendAuditEvent,
  computeFederationRulesHash,
  enforceLaws,
  exportProof,
  getMerkleRoot,
  LAW_001_MANIFEST,
  listAuditEvents,
  verifyChain,
};
export type {
  AuditAppendResult,
  AuditLogEvent,
  AuditProof,
  AuditProofStep,
} from './audit-logger';

const shouldLogToConsole = (): boolean => {
  const debug = process.env.DROIDSWARM_DEBUG?.toLowerCase();
  return debug === '1' || debug === 'true' || debug === 'yes' || debug === 'on';
};

const consoleLog = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void => {
  if (!shouldLogToConsole() && level !== 'error') {
    return;
  }

  switch (level) {
    case 'debug':
      console.log(`[shared-tracing] ${message}`, meta ?? {});
      break;
    case 'info':
      console.info(`[shared-tracing] ${message}`, meta ?? {});
      break;
    case 'warn':
      console.warn(`[shared-tracing] ${message}`, meta ?? {});
      break;
    case 'error':
      console.error(`[shared-tracing] ${message}`, meta ?? {});
      break;
  }
};

export const tracer = {
  debug: (message: string, meta?: Record<string, unknown>): void => {
    consoleLog('debug', message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>): void => {
    consoleLog('info', message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    consoleLog('warn', message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    consoleLog('error', message, meta);
  },
  trace: (eventType: string, payload: Record<string, unknown> = {}, nodeId?: string) =>
    appendAuditEvent(eventType, payload, nodeId),
  logEvent: (eventType: string, payload: Record<string, unknown> = {}, nodeId?: string) =>
    appendAuditEvent(eventType, payload, nodeId),
  audit: (eventType: string, payload: Record<string, unknown> = {}, nodeId?: string) =>
    appendAuditEvent(eventType, payload, nodeId),
  getAuditRoot: (dbPath?: string) => getMerkleRoot(dbPath),
  verifyAuditChain: (startId?: number, endId?: number, dbPath?: string) => verifyChain(startId, endId, dbPath),
  exportProof: (eventId: number, dbPath?: string) => exportProof(eventId, dbPath),
  listAuditEvents: (limit?: number, dbPath?: string) => listAuditEvents(limit, dbPath),
};

export const instrumentOrchestrator = <T extends object>(orchestrator: T): T => {
  const candidate = orchestrator as T & {
    start?: (...args: unknown[]) => unknown;
    stop?: (...args: unknown[]) => unknown;
  };

  if (typeof candidate.start === 'function') {
    const originalStart = candidate.start.bind(orchestrator);
    candidate.start = (...args: unknown[]) => {
      tracer.audit('ORCHESTRATOR_START', {
        args,
        orchestrator: orchestrator.constructor?.name ?? 'unknown',
      });
      return originalStart(...args);
    };
  }

  if (typeof candidate.stop === 'function') {
    const originalStop = candidate.stop.bind(orchestrator);
    candidate.stop = (...args: unknown[]) => {
      tracer.audit('ORCHESTRATOR_STOP', {
        args,
        orchestrator: orchestrator.constructor?.name ?? 'unknown',
      });
      return originalStop(...args);
    };
  }

  return orchestrator;
};
