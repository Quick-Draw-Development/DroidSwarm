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
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = require("node:test");
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_codex_runner = require("./codex-runner");
const createFakeCodex = () => {
  const dir = (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-fake-codex-"));
  const scriptPath = import_node_path.default.join(dir, "codex");
  (0, import_node_fs.writeFileSync)(scriptPath, `#!/usr/bin/env bash
set -euo pipefail
output_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-last-message)
      shift
      output_file="$1"
      ;;
  esac
  shift || true
done
cat >/dev/null
cat >"$output_file" <<'EOF'
{"status":"completed","summary":"planned work","requested_agents":[],"artifacts":[{"kind":"plan","title":"Plan","content":"Do the work"}],"doc_updates":[],"branch_actions":[]}
EOF
`);
  (0, import_node_fs.chmodSync)(scriptPath, 493);
  return dir;
};
(0, import_node_test.describe)("runCodexPrompt", () => {
  (0, import_node_test.it)("executes a codex-like binary and parses the structured result", async () => {
    const fakeCodexDir = createFakeCodex();
    const fakeCodexPath = import_node_path.default.join(fakeCodexDir, "codex");
    const config = {
      environment: "test",
      projectId: "proj-1",
      projectName: "Project 1",
      projectRoot: process.cwd(),
      repoId: "proj-1-repo",
      defaultBranch: "main",
      developBranch: "develop",
      allowedRepoRoots: [process.cwd()],
      workspaceRoot: import_node_path.default.join(process.cwd(), ".droidswarm", "workspaces"),
      agentName: "Orchestrator",
      agentRole: "control-plane",
      socketUrl: "ws://localhost:8765",
      heartbeatMs: 1e4,
      reconnectMs: 1e3,
      codexBin: fakeCodexPath,
      codexCloudModel: "gpt-5-codex",
      codexApiBaseUrl: "https://api.openai.com/v1",
      codexApiKey: "test-key",
      codexSandboxMode: "workspace-write",
      llamaBaseUrl: "http://127.0.0.1:11434",
      llamaModel: "llama",
      llamaTimeoutMs: 1e3,
      prAutomationEnabled: false,
      prRemoteName: "origin",
      gitPolicy: {
        mainBranch: "main",
        developBranch: "develop",
        prefixes: {
          feature: "feature/",
          hotfix: "hotfix/",
          release: "release/",
          support: "support/"
        }
      },
      maxAgentsPerTask: 4,
      maxConcurrentAgents: 8,
      specDir: process.cwd(),
      orchestratorRules: "",
      droidspeakRules: "",
      agentRules: "",
      plannerRules: "",
      codingRules: "",
      dbPath: import_node_path.default.join(process.cwd(), "state.db"),
      schedulerMaxTaskDepth: 4,
      schedulerMaxFanOut: 3,
      schedulerRetryIntervalMs: 1e3,
      maxConcurrentCodeAgents: 2,
      sideEffectActionsBeforeReview: 0,
      allowedTools: [],
      modelRouting: {
        planning: "o1-preview",
        verification: "gpt-4o-mini",
        code: "claude-3.5-sonnet",
        apple: "apple-intelligence/local",
        default: "o1-preview"
      },
      routingPolicy: {
        plannerRoles: ["plan", "planner", "research", "review", "orchestrator", "checkpoint", "compress"],
        appleRoles: ["apple", "ios", "macos", "swift", "swiftui", "xcode", "visionos"],
        appleTaskHints: ["apple", "ios", "ipad", "iphone", "macos", "osx", "swift", "swiftui", "objective-c", "uikit", "appkit", "xcode", "testflight", "visionos", "watchos", "tvos"],
        codeHints: ["code", "coder", "dev", "implementation", "debug", "refactor"],
        cloudEscalationHints: ["refactor", "debug", "multi-file", "migration", "large-scale"]
      },
      budgetMaxConsumed: void 0
    };
    try {
      const result = await (0, import_codex_runner.runCodexPrompt)({
        config,
        prompt: "plan the work",
        projectRoot: process.cwd()
      });
      import_strict.default.equal(result.status, "completed");
      import_strict.default.equal(result.summary, "planned work");
      import_strict.default.equal(result.artifacts[0]?.kind, "plan");
    } finally {
      (0, import_node_fs.rmSync)(fakeCodexDir, { recursive: true, force: true });
    }
  });
});
