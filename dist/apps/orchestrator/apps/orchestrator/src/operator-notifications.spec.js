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
var import_node_test = require("node:test");
var import_node_assert = __toESM(require("node:assert"));
var import_operator_notifications = require("./operator-notifications");
(0, import_node_test.describe)("operator-notifications", () => {
  (0, import_node_test.it)("formats assignment content", () => {
    const agents = [
      { agentName: "Planner-01", taskId: "task-1", role: "planner" },
      { agentName: "Coder-02", taskId: "task-1", role: "coder" }
    ];
    const content = (0, import_operator_notifications.formatAgentAssignmentContent)(agents);
    import_node_assert.default.strictEqual(content, "Assigned agents: Planner-01 (planner), Coder-02 (coder).");
  });
  (0, import_node_test.it)("handles zero assignments", () => {
    import_node_assert.default.strictEqual((0, import_operator_notifications.formatAgentAssignmentContent)([]), "Assigned agents: none.");
  });
  (0, import_node_test.it)("formats request content", () => {
    const requests = [
      { role: "architect", reason: "design", instructions: "" },
      { role: "tester", reason: "qa", instructions: "" }
    ];
    const content = (0, import_operator_notifications.formatAgentRequestContent)("Planner-01", requests);
    import_node_assert.default.strictEqual(content, "Planner-01 requested additional agents: architect (design), tester (qa)");
  });
  (0, import_node_test.it)("handles empty request list", () => {
    import_node_assert.default.strictEqual((0, import_operator_notifications.formatAgentRequestContent)("Planner-01", []), "Planner-01 requested additional agents: none.");
  });
  (0, import_node_test.it)("builds review announcement", () => {
    import_node_assert.default.strictEqual((0, import_operator_notifications.buildReviewAnnouncement)("birk_dv"), "birk_dv is reviewing this task.");
  });
});
