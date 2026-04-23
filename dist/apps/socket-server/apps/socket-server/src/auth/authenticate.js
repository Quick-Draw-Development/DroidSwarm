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
var authenticate_exports = {};
__export(authenticate_exports, {
  AuthenticationError: () => AuthenticationError,
  authenticateClient: () => authenticateClient
});
module.exports = __toCommonJS(authenticate_exports);
class AuthenticationError extends Error {
  constructor(message, reasonCode) {
    super(message);
    this.reasonCode = reasonCode;
    this.name = "AuthenticationError";
  }
}
const authenticateClient = (config, message) => {
  const allowedProjectIds = /* @__PURE__ */ new Set([
    config.projectId,
    ...config.allowedProjectIds ?? []
  ]);
  if (!allowedProjectIds.has(message.project_id)) {
    throw new AuthenticationError("Project mismatch", "project_mismatch");
  }
  const roomId = message.payload.room_id;
  const clientType = message.payload.client_type ?? "agent";
  const privileged = roomId === "operator" || clientType === "orchestrator" || clientType === "dashboard" || clientType === "system";
  if (roomId === "operator" && config.operatorToken && message.payload.token !== config.operatorToken) {
    throw new AuthenticationError("Privileged token required for operator room", "operator_token_required");
  }
  if (roomId === "operator" && !privileged) {
    throw new AuthenticationError("Operator room requires a privileged client type", "operator_room_forbidden");
  }
  const actorType = clientType === "dashboard" ? "human" : clientType;
  return {
    roomId,
    agentName: message.payload.agent_name,
    agentRole: message.payload.agent_role,
    clientType,
    actorType,
    privileged
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuthenticationError,
  authenticateClient
});
