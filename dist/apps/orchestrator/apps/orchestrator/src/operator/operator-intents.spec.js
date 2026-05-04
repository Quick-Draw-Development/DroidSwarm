var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = require("node:test");
var import_operator_intents = require("./operator-intents");
(0, import_node_test.describe)("operator intents", () => {
  (0, import_node_test.it)("treats plain text as a note", () => {
    const intent = (0, import_operator_intents.parseOperatorIntent)("Let me know when this is ready");
    import_strict.default.equal(intent.category, "note");
  });
  (0, import_node_test.it)("parses /cancel commands with task ids", () => {
    const intent = (0, import_operator_intents.parseOperatorIntent)("/cancel abc123 please stop");
    import_strict.default.equal(intent.category, "command");
    import_strict.default.equal(intent.action.type, "cancel_task");
    import_strict.default.equal(intent.action.taskId, "abc123");
    import_strict.default.equal(intent.action.reason, "please stop");
  });
  (0, import_node_test.it)("uses fallback task id when the command omits it", () => {
    const intent = (0, import_operator_intents.parseOperatorIntent)("/review", "fallback-task");
    import_strict.default.equal(intent.category, "command");
    import_strict.default.equal(intent.action.type, "request_review");
    import_strict.default.equal(intent.action.taskId, "fallback-task");
  });
  (0, import_node_test.it)("rejects commands missing required parameters", () => {
    const intent = (0, import_operator_intents.parseOperatorIntent)("/cancel");
    import_strict.default.equal(intent.category, "command_error");
    import_strict.default.ok(intent.message.includes("Missing task identifier"));
  });
  (0, import_node_test.it)("parses /priority commands with explicit level and reason", () => {
    const intent = (0, import_operator_intents.parseOperatorIntent)("/priority task-42 urgent adjust schedule");
    import_strict.default.equal(intent.category, "command");
    import_strict.default.equal(intent.action.type, "reprioritize");
    import_strict.default.equal(intent.action.taskId, "task-42");
    import_strict.default.equal(intent.action.priority, "urgent");
    import_strict.default.equal(intent.action.reason, "adjust schedule");
  });
  (0, import_node_test.it)("rejects priority commands with unknown levels", () => {
    const intent = (0, import_operator_intents.parseOperatorIntent)("/priority task-42 super urgent");
    import_strict.default.equal(intent.category, "command_error");
    import_strict.default.ok(intent.message.includes("Priority must be one of"));
  });
});
