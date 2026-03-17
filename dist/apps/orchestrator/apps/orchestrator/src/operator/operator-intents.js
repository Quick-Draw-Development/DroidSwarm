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
var operator_intents_exports = {};
__export(operator_intents_exports, {
  parseOperatorIntent: () => parseOperatorIntent
});
module.exports = __toCommonJS(operator_intents_exports);
const CANCEL_KEYWORDS = ["cancel", "stop", "abort"];
const REVIEW_KEYWORDS = ["review", "verify", "inspection", "approval"];
const REPRIORITIZE_KEYWORDS = ["priority", "reprioritize", "urgent", "urgentize"];
const findTaskId = (text, fallback) => {
  if (fallback) {
    return fallback;
  }
  const match = text.match(/task\s+([A-Za-z0-9-_]+)/i);
  return match ? match[1] : void 0;
};
const detectPriorityLevel = (text) => {
  if (/urgent/i.test(text)) {
    return "urgent";
  }
  if (/high/i.test(text)) {
    return "high";
  }
  if (/low/i.test(text)) {
    return "low";
  }
  return "medium";
};
const parseOperatorIntent = (text, taskId) => {
  const normalized = text.toLowerCase();
  if (CANCEL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return {
      category: "command",
      referencedTaskId: findTaskId(text, taskId),
      action: {
        type: "cancel_task",
        taskId: findTaskId(text, taskId),
        reason: text
      }
    };
  }
  if (REVIEW_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return {
      category: "command",
      referencedTaskId: findTaskId(text, taskId),
      action: {
        type: "request_review",
        taskId: findTaskId(text, taskId),
        reason: text
      }
    };
  }
  if (REPRIORITIZE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return {
      category: "command",
      referencedTaskId: findTaskId(text, taskId),
      action: {
        type: "reprioritize",
        taskId: findTaskId(text, taskId),
        priority: detectPriorityLevel(text),
        reason: text
      }
    };
  }
  return { category: "note", raw: text, referencedTaskId: taskId };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseOperatorIntent
});
