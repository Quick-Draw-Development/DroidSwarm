var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var codex_runner_exports = {};
__export(codex_runner_exports, {
  runCodexPrompt: () => runCodexPrompt
});
module.exports = __toCommonJS(codex_runner_exports);
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = __toESM(require("node:path"));
var import_node_child_process = require("node:child_process");
var import_codex_schema = require("./codex-schema");
const createTempWorkspace = () => (0, import_node_fs.mkdtempSync)(import_node_path.default.join((0, import_node_os.tmpdir)(), "droidswarm-codex-"));
const runCodexPrompt = async (input) => {
  const tempDir = createTempWorkspace();
  const schemaPath = import_node_path.default.join(tempDir, "schema.json");
  const outputPath = import_node_path.default.join(tempDir, "result.json");
  (0, import_node_fs.writeFileSync)(schemaPath, JSON.stringify(import_codex_schema.codexAgentOutputSchema, null, 2));
  const args = [
    "exec",
    "--cd",
    input.projectRoot,
    "--skip-git-repo-check",
    "--sandbox",
    input.config.codexSandboxMode,
    "--color",
    "never",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "-"
  ];
  if (input.config.codexModel) {
    args.splice(1, 0, "--model", input.config.codexModel);
  }
  await new Promise((resolve, reject) => {
    const child = (0, import_node_child_process.spawn)(input.config.codexBin, args, {
      cwd: input.projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    child.stdout.on("data", () => {
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Codex exited with code ${code ?? "unknown"}`));
    });
    child.stdin.end(input.prompt);
  });
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(outputPath, "utf8"));
  } finally {
    (0, import_node_fs.rmSync)(tempDir, { recursive: true, force: true });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runCodexPrompt
});
