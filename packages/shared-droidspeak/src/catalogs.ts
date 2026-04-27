// Droidspeak catalogs - predefined axes modeled after Asolaria's 47-dimensional Brown-Hilbert space

export const DROIDSPEAK_CATALOGS = {
  // D1: Actors (16 entries)
  D1: {
    'orch-01': 'Orchestrator',
    'worker-planner': 'Planner Worker',
    'worker-researcher': 'Researcher Worker',
    'worker-coder': 'Coder Worker',
    'worker-analyst': 'Analyst Worker',
    'worker-tester': 'Tester Worker',
    'worker-documenter': 'Documenter Worker',
    'worker-reviewer': 'Reviewer Worker',
    'worker-deployer': 'Deployer Worker',
    'worker-monitor': 'Monitor Worker',
    'worker-orchestrator': 'Orchestrator Worker',
    'worker-federation': 'Federation Worker',
    'worker-aggregator': 'Aggregator Worker',
    'worker-router': 'Router Worker',
    'worker-tracer': 'Tracer Worker',
    'worker-model': 'Model Worker'
  },
  
  // D2: Verbs (32 entries)
  D2: {
    'EVT-TASK-START': 'Task Start',
    'EVT-TASK-END': 'Task End',
    'EVT-HANDOFF': 'Handoff',
    'EVT-CODE-EXEC': 'Code Execution',
    'EVT-REVIEW': 'Review',
    'EVT-TEST': 'Test',
    'EVT-DEPLOY': 'Deploy',
    'EVT-ANALYZE': 'Analyze',
    'EVT-RESEARCH': 'Research',
    'EVT-DOCUMENT': 'Document',
    'EVT-COMMIT': 'Commit',
    'EVT-UPDATE': 'Update',
    'EVT-ERROR': 'Error',
    'EVT-WARNING': 'Warning',
    'EVT-INFO': 'Information',
    'EVT-LOG': 'Log',
    'EVT-QUERY': 'Query',
    'EVT-RESPONSE': 'Response',
    'EVT-REQUEST': 'Request',
    'EVT-ACK': 'Acknowledge',
    'EVT-NOTIFY': 'Notify',
    'EVT-REPORT': 'Report',
    'EVT-DECIDE': 'Decide',
    'EVT-PLAN': 'Plan',
    'EVT-EXECUTE': 'Execute',
    'EVT-VALIDATE': 'Validate',
    'EVT-VERIFY': 'Verify',
    'EVT-ASSESS': 'Assess',
    'EVT-EVALUATE': 'Evaluate',
    'EVT-CLASSIFY': 'Classify',
    'EVT-CLUSTER': 'Cluster',
    'EVT-ASSIGN': 'Assign',
    'EVT-REASSIGN': 'Reassign',
    'EVT-LAW-PROPOSAL': 'Law Proposal',
    'EVT-DEBATE-ROUND': 'Debate Round',
    'EVT-VOTE': 'Vote',
    'EVT-HUMAN-APPROVAL': 'Human Approval',
    'EVT-LAW-UPDATE': 'Law Update',
    'EVT-COMPLIANCE-CHECK': 'Compliance Check',
    'EVT-GUARDIAN-VETO': 'Guardian Veto',
    'EVT-SKILL-REGISTERED': 'Skill Registered',
    'EVT-AGENT-UPDATED': 'Agent Updated'
  },
  
  // D11: Promotion (8 entries)
  D11: {
    'PROMO-1': 'Priority 1',
    'PROMO-2': 'Priority 2',
    'PROMO-3': 'Priority 3',
    'PROMO-4': 'Priority 4',
    'PROMO-5': 'Priority 5',
    'PROMO-6': 'Priority 6',
    'PROMO-7': 'Priority 7',
    'PROMO-8': 'Priority 8'
  },
  
  // M: Mode (8 entries)
  M: {
    'M-sync': 'Synchronous',
    'M-async': 'Asynchronous',
    'M-review': 'Review Mode',
    'M-federated': 'Federated',
    'M-parallel': 'Parallel',
    'M-sequential': 'Sequential',
    'M-batched': 'Batched',
    'M-stream': 'Stream'
  },
  
  // Project tags (8 entries)
  PRJ: {
    'abc123': 'Project Alpha',
    'def456': 'Project Beta',
    'ghi789': 'Project Gamma',
    'jkl012': 'Project Delta',
    'mno345': 'Project Epsilon',
    'pqr678': 'Project Zeta',
    'stu901': 'Project Eta',
    'vwx234': 'Project Theta'
  }
};

export const buildDroidspeakCatalogs = (input?: {
  verbs?: Record<string, string>;
}): typeof DROIDSPEAK_CATALOGS => ({
  ...DROIDSPEAK_CATALOGS,
  D2: {
    ...DROIDSPEAK_CATALOGS.D2,
    ...(input?.verbs ?? {}),
  },
});

// Type definitions for Droidspeak axes
export type D1Axis = keyof typeof DROIDSPEAK_CATALOGS.D1;
export type D2Axis = keyof typeof DROIDSPEAK_CATALOGS.D2;
export type D11Axis = keyof typeof DROIDSPEAK_CATALOGS.D11;
export type MAxis = keyof typeof DROIDSPEAK_CATALOGS.M;
export type PRJAxis = keyof typeof DROIDSPEAK_CATALOGS.PRJ;

export type DroidspeakAxis = D1Axis | D2Axis | D11Axis | MAxis | PRJAxis;
