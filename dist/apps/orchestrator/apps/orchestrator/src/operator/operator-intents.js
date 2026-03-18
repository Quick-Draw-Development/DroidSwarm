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
const PRIORITY_LEVELS = ["low", "medium", "high", "urgent"];
const FALLBACK_COMMAND_HELP = "Usage: /cancel <task-id> [reason], /review <task-id> [reason], /priority <task-id> <level> [reason].";
const sanitizeReason = (tokens) => {
  const content = tokens.join(" ").trim();
  return content.length > 0 ? content : void 0;
};
const parseOperatorIntent = (text, taskId) => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/") || trimmed.length === 1) {
    return {
      category: "note",
      raw: text,
      referencedTaskId: taskId
    };
  }
  const commandBody = trimmed.slice(1).trim();
  if (!commandBody) {
    return {
      category: "command_error",
      referencedTaskId: taskId,
      message: `Command not recognized. ${FALLBACK_COMMAND_HELP}`
    };
  }
  const segments = commandBody.split(/\s+/);
  const command = segments[0].toLowerCase();
  const args = segments.slice(1);
  const fallbackTaskId = taskId;
  const targetTaskId = args[0] ?? fallbackTaskId;
  switch (command) {
    case "cancel": {
      if (!targetTaskId) {
        return {
          category: "command_error",
          referencedTaskId: fallbackTaskId,
          message: `Missing task identifier. ${FALLBACK_COMMAND_HELP}`
        };
      }
      const reason = sanitizeReason(args.slice(1));
      return {
        category: "command",
        referencedTaskId: targetTaskId,
        action: {
          type: "cancel_task",
          taskId: targetTaskId,
          reason
        }
      };
    }
    case "review": {
      if (!targetTaskId) {
        return {
          category: "command_error",
          referencedTaskId: fallbackTaskId,
          message: `Missing task identifier. ${FALLBACK_COMMAND_HELP}`
        };
      }
      const reason = sanitizeReason(args.slice(1));
      return {
        category: "command",
        referencedTaskId: targetTaskId,
        action: {
          type: "request_review",
          taskId: targetTaskId,
          reason
        }
      };
    }
    case "priority": {
      if (!targetTaskId) {
        return {
          category: "command_error",
          referencedTaskId: fallbackTaskId,
          message: `Missing task identifier. ${FALLBACK_COMMAND_HELP}`
        };
      }
      const priorityCandidate = args[1];
      if (!priorityCandidate) {
        return {
          category: "command_error",
          referencedTaskId: targetTaskId,
          message: `Missing priority level. ${FALLBACK_COMMAND_HELP}`
        };
      }
      const normalizedPriority = priorityCandidate.toLowerCase();
      if (!PRIORITY_LEVELS.includes(normalizedPriority)) {
        return {
          category: "command_error",
          referencedTaskId: targetTaskId,
          message: `Priority must be one of ${PRIORITY_LEVELS.join(", ")}.`
        };
      }
      const reason = sanitizeReason(args.slice(2));
      return {
        category: "command",
        referencedTaskId: targetTaskId,
        action: {
          type: "reprioritize",
          taskId: targetTaskId,
          priority: normalizedPriority,
          reason
        }
      };
    }
    default: {
      return {
        category: "command_error",
        referencedTaskId: fallbackTaskId,
        message: `Unknown command "/${command}". ${FALLBACK_COMMAND_HELP}`
      };
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseOperatorIntent
});
