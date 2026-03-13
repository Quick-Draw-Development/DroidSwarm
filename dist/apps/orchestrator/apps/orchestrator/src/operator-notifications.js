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
var operator_notifications_exports = {};
__export(operator_notifications_exports, {
  buildReviewAnnouncement: () => buildReviewAnnouncement,
  formatAgentAssignmentContent: () => formatAgentAssignmentContent,
  formatAgentRequestContent: () => formatAgentRequestContent
});
module.exports = __toCommonJS(operator_notifications_exports);
const formatAgentAssignmentContent = (agents) => {
  if (agents.length === 0) {
    return "Assigned agents: none.";
  }
  const details = agents.map((agent) => `${agent.agentName} (${agent.role})`).join(", ");
  return `Assigned agents: ${details}.`;
};
const formatAgentRequestContent = (agentName, requests) => {
  if (requests.length === 0) {
    return `${agentName} requested additional agents: none.`;
  }
  const requestDetails = requests.map((request) => `${request.role} (${request.reason})`).join(", ");
  return `${agentName} requested additional agents: ${requestDetails}`;
};
const buildReviewAnnouncement = (operatorName) => `${operatorName} is reviewing this task.`;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildReviewAnnouncement,
  formatAgentAssignmentContent,
  formatAgentRequestContent
});
