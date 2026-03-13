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
var types_exports = {};
__export(types_exports, {
  ACTOR_TYPES: () => ACTOR_TYPES,
  CLIENT_TYPES: () => CLIENT_TYPES,
  MESSAGE_TYPES: () => MESSAGE_TYPES
});
module.exports = __toCommonJS(types_exports);
const MESSAGE_TYPES = [
  "auth",
  "status_update",
  "request_help",
  "handoff_event",
  "guardrail_event",
  "trace_event",
  "usage_event",
  "limit_event",
  "checkpoint_event",
  "artifact",
  "proposal",
  "vote",
  "clarification_request",
  "clarification_response",
  "task_created",
  "task_intake_accepted",
  "chat",
  "heartbeat"
];
const ACTOR_TYPES = ["agent", "orchestrator", "human", "system", "tool"];
const CLIENT_TYPES = ["agent", "orchestrator", "human", "dashboard", "system"];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ACTOR_TYPES,
  CLIENT_TYPES,
  MESSAGE_TYPES
});
