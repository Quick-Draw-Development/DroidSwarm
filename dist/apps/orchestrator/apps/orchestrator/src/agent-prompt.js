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
  const normalizedRole = role.toLowerCase();
  const specSection = input.specRules ? ["Operating instructions from the spec card:", input.specRules, ""] : [];
  const droidspeakSection = input.specDroidspeak ? ["Droidspeak reference (droidspeak-v1):", input.specDroidspeak, ""] : [];
  const parentDroidspeakSection = input.parentDroidspeak ? ["Parent Droidspeak summary (droidspeak-v1):", input.parentDroidspeak, ""] : [];
  const digestSection = input.taskDigest ? [
    "Task state digest:",
    `- objective: ${input.taskDigest.objective}`,
    `- current_plan: ${input.taskDigest.currentPlan.join(" | ") || "none"}`,
    `- decisions: ${input.taskDigest.decisions.join(" | ") || "none"}`,
    `- open_questions: ${input.taskDigest.openQuestions.join(" | ") || "none"}`,
    `- active_risks: ${input.taskDigest.activeRisks.join(" | ") || "none"}`,
    `- verification_state: ${input.taskDigest.verificationState}`,
    input.taskDigest.droidspeak ? `- droidspeak_v2: ${input.taskDigest.droidspeak.compact} (${input.taskDigest.droidspeak.expanded})` : "",
    ""
  ].filter(Boolean) : [];
  const handoffSection = input.handoffPacket ? [
    "Handoff packet:",
    `- summary: ${input.handoffPacket.summary}`,
    `- required_reads: ${input.handoffPacket.requiredReads.join(", ") || "none"}`,
    input.handoffPacket.droidspeak ? `- handoff_droidspeak_v2: ${input.handoffPacket.droidspeak.compact} (${input.handoffPacket.droidspeak.expanded})` : "",
    ""
  ].filter(Boolean) : [];
  const memorySection = (input.memoryContext?.length ?? 0) > 0 ? [
    "Relevant long-term memory:",
    ...input.memoryContext.map((memory, index) => `${index + 1}. ${memory.droidspeakSummary} (${memory.englishTranslation})`),
    ""
  ] : [];
  const roleSpecificSection = normalizedRole.includes("arbiter") ? [
    "Arbiter contract:",
    "- Compare the sibling specialist outputs before proposing new work.",
    "- Return an agreement summary, a disagreement summary, a winner or merge recommendation, a confidence statement, and a follow-up action.",
    "- If the disagreement cannot be resolved from the available evidence, request human review instead of guessing.",
    ""
  ] : [];
  return [
    `You are ${agentName}, a DroidSwarm Codex worker for project ${projectName} (${projectId}).`,
    ...specSection,
    ...droidspeakSection,
    `Role: ${role}.`,
    "",
    ...roleSpecificSection,
    "Follow these operating rules:",
    "- Respect the task scope and the assigned role only.",
    "- Use the project codebase and existing documentation as primary context.",
    "- Prefer concise, structured outcomes over long prose.",
    "- If you need another role, request it through requested_agents rather than trying to do everything yourself.",
    "- If requirements are unclear, set clarification_question instead of guessing.",
    "- If code or docs need durable updates, mention them in doc_updates.",
    "- Capture the workstate in a bounded droidspeak-v2 summary and expose it through the compression object.",
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
    ...parentDroidspeakSection,
    ...digestSection,
    ...handoffSection,
    ...memorySection,
    "",
    "Already requested follow-on roles:",
    formatRequestedAgents(input.requestedAgents ?? []),
    "",
    "Your final response must satisfy the provided JSON schema exactly.",
    'Provide a compression object with scheme "droidspeak-v2" and a short compressed_content string using only the bounded coordination vocabulary for plan status, blocked/unblocked, handoff ready, verification needed, summary emitted, and memory pinned.',
    "Keep artifact content concise and directly useful to the next agent or the human reviewer."
  ].join("\n");
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildAgentPrompt
});
