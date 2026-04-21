import type { RequestedAgent, TaskRecord } from './types';

const formatRequestedAgents = (requestedAgents: RequestedAgent[]): string =>
  requestedAgents.length > 0
    ? requestedAgents.map((agent, index) => `${index + 1}. ${agent.role}: ${agent.reason}`).join('\n')
    : 'None yet.';

export const buildAgentPrompt = (input: {
  task: TaskRecord;
  role: string;
  agentName: string;
  projectName: string;
  projectId: string;
  parentSummary?: string;
  parentDroidspeak?: string;
  specRules?: string;
  specDroidspeak?: string;
  requestedAgents?: RequestedAgent[];
  taskDigest?: {
    objective: string;
    currentPlan: string[];
    decisions: string[];
    openQuestions: string[];
    activeRisks: string[];
    verificationState: string;
    droidspeak?: { compact: string; expanded: string };
  };
  handoffPacket?: {
    summary: string;
    requiredReads: string[];
    droidspeak?: { compact: string; expanded: string };
  };
}): string => {
  const { task, role, agentName, projectName, projectId, parentSummary } = input;
  const specSection = input.specRules
    ? ['Operating instructions from the spec card:', input.specRules, '']
    : [];
  const droidspeakSection = input.specDroidspeak
    ? ['Droidspeak reference (droidspeak-v1):', input.specDroidspeak, '']
    : [];
  const parentDroidspeakSection = input.parentDroidspeak
    ? ['Parent Droidspeak summary (droidspeak-v1):', input.parentDroidspeak, '']
    : [];
  const digestSection = input.taskDigest
    ? [
      'Task state digest:',
      `- objective: ${input.taskDigest.objective}`,
      `- current_plan: ${input.taskDigest.currentPlan.join(' | ') || 'none'}`,
      `- decisions: ${input.taskDigest.decisions.join(' | ') || 'none'}`,
      `- open_questions: ${input.taskDigest.openQuestions.join(' | ') || 'none'}`,
      `- active_risks: ${input.taskDigest.activeRisks.join(' | ') || 'none'}`,
      `- verification_state: ${input.taskDigest.verificationState}`,
      input.taskDigest.droidspeak
        ? `- droidspeak_v2: ${input.taskDigest.droidspeak.compact} (${input.taskDigest.droidspeak.expanded})`
        : '',
      '',
    ].filter(Boolean)
    : [];
  const handoffSection = input.handoffPacket
    ? [
      'Handoff packet:',
      `- summary: ${input.handoffPacket.summary}`,
      `- required_reads: ${input.handoffPacket.requiredReads.join(', ') || 'none'}`,
      input.handoffPacket.droidspeak
        ? `- handoff_droidspeak_v2: ${input.handoffPacket.droidspeak.compact} (${input.handoffPacket.droidspeak.expanded})`
        : '',
      '',
    ].filter(Boolean)
    : [];

  return [
    `You are ${agentName}, a DroidSwarm Codex worker for project ${projectName} (${projectId}).`,
    ...specSection,
    ...droidspeakSection,
    `Role: ${role}.`,
    '',
    'Follow these operating rules:',
    '- Respect the task scope and the assigned role only.',
    '- Use the project codebase and existing documentation as primary context.',
    '- Prefer concise, structured outcomes over long prose.',
    '- If you need another role, request it through requested_agents rather than trying to do everything yourself.',
    '- If requirements are unclear, set clarification_question instead of guessing.',
    '- If code or docs need durable updates, mention them in doc_updates.',
    '- Capture the workstate in a bounded droidspeak-v2 summary and expose it through the compression object.',
    '',
    'Task context:',
    `- task_id: ${task.taskId}`,
    `- title: ${task.title}`,
    `- description: ${task.description}`,
    `- task_type: ${task.taskType}`,
    `- priority: ${task.priority}`,
    `- branch_name: ${task.branchName ?? 'unassigned'}`,
    `- created_by: ${task.createdByUserId ?? 'unknown'}`,
    '',
    parentSummary ? `Parent summary:\n${parentSummary}` : 'Parent summary:\nNone.',
    ...parentDroidspeakSection,
    ...digestSection,
    ...handoffSection,
    '',
    'Already requested follow-on roles:',
    formatRequestedAgents(input.requestedAgents ?? []),
    '',
    'Your final response must satisfy the provided JSON schema exactly.',
    'Provide a compression object with scheme "droidspeak-v2" and a short compressed_content string using only the bounded coordination vocabulary for plan status, blocked/unblocked, handoff ready, verification needed, summary emitted, and memory pinned.',
    'Keep artifact content concise and directly useful to the next agent or the human reviewer.',
  ].join('\n');
};
