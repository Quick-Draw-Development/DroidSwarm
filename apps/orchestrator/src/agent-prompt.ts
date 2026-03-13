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
  requestedAgents?: RequestedAgent[];
}): string => {
  const { task, role, agentName, projectName, projectId, parentSummary } = input;

  return [
    `You are ${agentName}, a DroidSwarm Codex worker for project ${projectName} (${projectId}).`,
    `Role: ${role}.`,
    '',
    'Follow these operating rules:',
    '- Respect the task scope and the assigned role only.',
    '- Use the project codebase and existing documentation as primary context.',
    '- Prefer concise, structured outcomes over long prose.',
    '- If you need another role, request it through requested_agents rather than trying to do everything yourself.',
    '- If requirements are unclear, set clarification_question instead of guessing.',
    '- If code or docs need durable updates, mention them in doc_updates.',
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
    '',
    'Already requested follow-on roles:',
    formatRequestedAgents(input.requestedAgents ?? []),
    '',
    'Your final response must satisfy the provided JSON schema exactly.',
    'Keep artifact content concise and directly useful to the next agent or the human reviewer.',
  ].join('\n');
};
