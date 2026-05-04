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
var config_exports = {};
__export(config_exports, {
  loadConfig: () => loadConfig
});
module.exports = __toCommonJS(config_exports);
var import_node_path = __toESM(require("node:path"));
const toPositiveInt = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const toBooleanFlag = (value, fallback = false) => {
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};
const parseCommaList = (value) => {
  if (!value) {
    return void 0;
  }
  const normalized = value.split(",").map((part) => part.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : void 0;
};
const loadConfig = () => {
  const environment = process.env.NODE_ENV ?? "development";
  return {
    host: process.env.DROIDSWARM_SOCKET_HOST ?? "127.0.0.1",
    port: toPositiveInt(process.env.DROIDSWARM_SOCKET_PORT, 8765),
    projectId: process.env.DROIDSWARM_PROJECT_ID ?? "droidswarm",
    allowedProjectIds: parseCommaList(process.env.DROIDSWARM_PROJECT_IDS),
    projectName: process.env.DROIDSWARM_PROJECT_NAME ?? "DroidSwarm",
    dbPath: process.env.DROIDSWARM_DB_PATH ?? import_node_path.default.resolve(process.cwd(), "data", "droidswarm.db"),
    debug: toBooleanFlag(process.env.DROIDSWARM_DEBUG, false),
    swarmId: process.env.DROIDSWARM_SWARM_ID,
    operatorToken: process.env.DROIDSWARM_OPERATOR_TOKEN,
    authTimeoutMs: toPositiveInt(process.env.DROIDSWARM_AUTH_TIMEOUT_MS, 5e3),
    heartbeatTimeoutMs: toPositiveInt(process.env.DROIDSWARM_HEARTBEAT_TIMEOUT_MS, 9e4),
    maxMessagesPerWindow: toPositiveInt(process.env.DROIDSWARM_MAX_MESSAGES_PER_WINDOW, 10),
    messageWindowMs: toPositiveInt(process.env.DROIDSWARM_MESSAGE_WINDOW_MS, 1e3),
    federationEnabled: toBooleanFlag(process.env.DROIDSWARM_ENABLE_FEDERATION, false),
    federationNodeId: process.env.DROIDSWARM_FEDERATION_NODE_ID ?? process.env.DROIDSWARM_SWARM_ID ?? process.env.DROIDSWARM_PROJECT_ID ?? "droidswarm-local",
    federationBusUrl: process.env.DROIDSWARM_FEDERATION_BUS_URL,
    federationAdminUrl: process.env.DROIDSWARM_FEDERATION_ADMIN_URL,
    federationPollMs: toPositiveInt(process.env.DROIDSWARM_FEDERATION_POLL_MS, 2e3),
    federationSigningKeyId: process.env.DROIDSWARM_FEDERATION_SIGNING_KEY_ID,
    federationSigningPrivateKey: process.env.DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY,
    governanceEnabled: toBooleanFlag(process.env.DROIDSWARM_ENABLE_GOVERNANCE, true),
    environment
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadConfig
});
