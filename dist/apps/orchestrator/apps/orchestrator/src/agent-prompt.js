var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var agent_prompt_exports = {};
__export(agent_prompt_exports, {
  buildAgentPrompt: () => buildAgentPrompt
});
module.exports = __toCommonJS(agent_prompt_exports);
const formatRequestedAgents = (requestedAgents) => requestedAgents.length > 0 ? requestedAgents.map((agent, index) => `${index + 1}. ${agent.role}: ${agent.reason}`).join("\n") : "None yet.";
const buildAgentPrompt = (input) => {
  const { task, role, agentName, projectName, projectId, parentSummary } = input;
  return [
    `You are ${agentName}, a DroidSwarm Codex worker for project ${projectName} (${projectId}).`,
    `Role: ${role}.`,
    "",
    "Follow these operating rules:",
    "- Respect the task scope and the assigned role only.",
    "- Use the project codebase and existing documentation as primary context.",
    "- Prefer concise, structured outcomes over long prose.",
    "- If you need another role, request it through requested_agents rather than trying to do everything yourself.",
    "- If requirements are unclear, set clarification_question instead of guessing.",
    "- If code or docs need durable updates, mention them in doc_updates.",
    "",
    "Task context:",
    `- task_id: ${task.taskId}`,
    `- title: ${task.title}`,
    `- description: ${task.description}`,
    `- task_type: ${task.taskType}`,
    `- priority: ${task.priority}`,
    `- branch_name: ${task.branchName ?? "unassigned"}`,
    `- created_by: ${task.createdByUserId ?? "unknown"}`,
    "",
    parentSummary ? `Parent summary:
${parentSummary}` : "Parent summary:\nNone.",
    "",
    "Already requested follow-on roles:",
    formatRequestedAgents(input.requestedAgents ?? []),
    "",
    "Your final response must satisfy the provided JSON schema exactly.",
    "Keep artifact content concise and directly useful to the next agent or the human reviewer."
  ].join("\n");
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildAgentPrompt
});
