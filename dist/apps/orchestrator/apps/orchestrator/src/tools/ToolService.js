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
var ToolService_exports = {};
__export(ToolService_exports, {
  ToolService: () => ToolService
});
module.exports = __toCommonJS(ToolService_exports);
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
const truncate = (value, limit = 1024) => value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
const ensureStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((part) => String(part));
  }
  if (typeof value === "string") {
    return value.split(/\s+/).filter(Boolean);
  }
  return [];
};
class ToolService {
  constructor(config, persistence) {
    this.config = config;
    this.persistence = persistence;
  }
  async handleRequest(request) {
    this.persistence.recordExecutionEvent(
      "tool_request",
      `Tool ${request.toolName} requested`,
      {
        requestId: request.requestId,
        taskId: request.taskId,
        tool: request.toolName
      }
    );
    let response;
    try {
      switch (request.toolName) {
        case "file_read":
          response = await this.handleFileRead(request);
          break;
        case "file_write":
          response = await this.handleFileWrite(request);
          break;
        case "nx_run":
          response = await this.handleNxRun(request);
          break;
        case "web_search":
          response = await this.handleWebSearch(request);
          break;
        case "checkpoint_search":
          response = await this.handleCheckpointSearch(request);
          break;
        default:
          throw new Error(`Unsupported tool ${request.toolName}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool execution error";
      response = {
        status: "error",
        error: message
      };
    }
    this.persistence.recordExecutionEvent(
      "tool_response",
      `Tool ${request.toolName} responded ${response.status}`,
      {
        requestId: request.requestId,
        taskId: request.taskId,
        tool: request.toolName,
        status: response.status
      }
    );
    return response;
  }
  async handleFileRead(request) {
    const target = this.asString(request.parameters?.path);
    if (!target) {
      throw new Error("file_read requires a path parameter");
    }
    const resolved = this.resolveProjectPath(request.taskId, target);
    const content = await import_node_fs.promises.readFile(resolved, "utf-8");
    return {
      status: "success",
      result: {
        path: import_node_path.default.relative(this.config.projectRoot, resolved),
        content,
        summary: content.length > 512 ? `${content.slice(0, 512)}...` : content,
        size: content.length
      }
    };
  }
  async handleFileWrite(request) {
    const target = this.asString(request.parameters?.path);
    const content = this.asString(request.parameters?.content) ?? "";
    if (!target) {
      throw new Error("file_write requires a path parameter");
    }
    const resolved = this.resolveProjectPath(request.taskId, target);
    await import_node_fs.promises.mkdir(import_node_path.default.dirname(resolved), { recursive: true });
    await import_node_fs.promises.writeFile(resolved, content, "utf-8");
    return {
      status: "success",
      result: {
        path: import_node_path.default.relative(this.config.projectRoot, resolved),
        size: content.length,
        summary: truncate(content)
      }
    };
  }
  async handleNxRun(request) {
    const command = this.asString(request.parameters?.command) ?? "npx";
    const candidateArgs = ensureStringArray(request.parameters?.args);
    const args = candidateArgs.length > 0 ? candidateArgs : ["nx", "--version"];
    const execution = await this.runCommand(request.taskId, command, args);
    return {
      status: "success",
      result: {
        command: `${command} ${args.join(" ")}`,
        stdout: truncate(execution.stdout, 1024),
        stderr: truncate(execution.stderr, 1024),
        exitCode: execution.exitCode
      }
    };
  }
  async handleWebSearch(request) {
    const query = this.asString(request.parameters?.query);
    if (!query) {
      throw new Error("web_search requires a query parameter");
    }
    const encoded = encodeURIComponent(query);
    const url = `https://r.jina.ai/http://lite.duckduckgo.com/50x.html?q=${encoded}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }
    const text = await response.text();
    const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      status: "success",
      result: {
        query,
        summary: truncate(cleaned, 1024),
        source: url
      }
    };
  }
  async handleCheckpointSearch(request) {
    const query = this.asString(request.parameters?.query);
    const limit = Number(request.parameters?.limit ?? 3);
    if (!query) {
      throw new Error("checkpoint_search requires a query parameter");
    }
    const results = this.persistence.searchCheckpoints(query, Math.max(1, limit));
    const formatted = results.map((entry) => ({
      checkpointId: entry.checkpointId,
      score: entry.score,
      summary: entry.summary,
      content: entry.content
    }));
    return {
      status: "success",
      result: {
        query,
        matches: formatted
      }
    };
  }
  resolveProjectPath(taskId, relativePath) {
    const root = this.resolveTaskRoot(taskId);
    const candidate = import_node_path.default.resolve(root, relativePath);
    if (!candidate.startsWith(root)) {
      throw new Error("Tool access outside of project root is forbidden");
    }
    return candidate;
  }
  asString(value) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return void 0;
  }
  resolveTaskRoot(taskId) {
    const task = this.persistence.getTask(taskId);
    const root = task?.rootPath ?? this.config.projectRoot;
    const allowedRoots = this.config.allowedRepoRoots.map((entry) => import_node_path.default.resolve(entry));
    const resolvedRoot = import_node_path.default.resolve(root);
    if (!allowedRoots.some((entry) => resolvedRoot === entry || resolvedRoot.startsWith(`${entry}${import_node_path.default.sep}`))) {
      throw new Error(`Task root ${resolvedRoot} is outside the configured repo allowlist`);
    }
    return resolvedRoot;
  }
  async runCommand(taskId, command, args) {
    return new Promise((resolve, reject) => {
      const child = (0, import_node_child_process.spawn)(command, args, {
        cwd: this.resolveTaskRoot(taskId),
        env: process.env
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf-8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ToolService
});
