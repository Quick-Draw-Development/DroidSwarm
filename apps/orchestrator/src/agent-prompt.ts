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
    '- Capture the workstate in a short droidspeak-v1 summary and expose it through the compression object.',
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
    '',
    'Already requested follow-on roles:',
    formatRequestedAgents(input.requestedAgents ?? []),
    '',
    'Your final response must satisfy the provided JSON schema exactly.',
    'Provide a compression object with scheme "droidspeak-v1" and a short compressed_content string (2-4 clauses) describing the current state, blockages, and next steps using the approved vocabulary.',
    'Keep artifact content concise and directly useful to the next agent or the human reviewer.',
  ].join('\n');
};
