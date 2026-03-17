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
var OperatorChatResponder_exports = {};
__export(OperatorChatResponder_exports, {
  OperatorChatResponder: () => OperatorChatResponder
});
module.exports = __toCommonJS(OperatorChatResponder_exports);
var import_codex_runner = require("../codex-runner");
class OperatorChatResponder {
  constructor(config) {
    this.config = config;
  }
  async respond(content) {
    const instructionSections = [
      this.config.orchestratorRules ? `Orchestrator rules:
${this.config.orchestratorRules}
` : void 0,
      this.config.droidspeakRules ? `Droidspeak reference (droidspeak-v1):
${this.config.droidspeakRules}
` : void 0
    ].filter(Boolean);
    const promptParts = [
      ...instructionSections,
      `You are ${this.config.agentName}, the DroidSwarm orchestrator for project ${this.config.projectName}.`,
      "Respond to the human operator message succinctly.",
      "If the message is an instruction, acknowledge it and state the next orchestration action.",
      "Do not fabricate task state or claim work that has not happened.",
      "Return a structured result with no spawned agents unless the operator explicitly asks for a new task workflow.",
      "",
      `Operator message: ${content}`
    ];
    const result = await (0, import_codex_runner.runCodexPrompt)({
      config: this.config,
      projectRoot: this.config.projectRoot,
      prompt: promptParts.join("\n")
    });
    return result.summary;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OperatorChatResponder
});
