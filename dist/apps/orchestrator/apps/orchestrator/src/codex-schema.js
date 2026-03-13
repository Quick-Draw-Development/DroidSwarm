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
var codex_schema_exports = {};
__export(codex_schema_exports, {
  codexAgentOutputSchema: () => codexAgentOutputSchema
});
module.exports = __toCommonJS(codex_schema_exports);
const codexAgentOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "requested_agents", "artifacts", "doc_updates", "branch_actions"],
  properties: {
    status: {
      type: "string",
      enum: ["completed", "blocked", "needs_help"]
    },
    summary: {
      type: "string",
      minLength: 1
    },
    requested_agents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "reason", "instructions"],
        properties: {
          role: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
          instructions: { type: "string", minLength: 1 }
        }
      }
    },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "content"],
        properties: {
          kind: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          content: { type: "string", minLength: 1 }
        }
      }
    },
    doc_updates: {
      type: "array",
      items: { type: "string" }
    },
    branch_actions: {
      type: "array",
      items: { type: "string" }
    },
    clarification_question: {
      type: "string"
    },
    reason_code: {
      type: "string"
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  codexAgentOutputSchema
});
