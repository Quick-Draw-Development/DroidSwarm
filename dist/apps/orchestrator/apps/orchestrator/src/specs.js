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
var specs_exports = {};
__export(specs_exports, {
  loadSpecCards: () => loadSpecCards
});
module.exports = __toCommonJS(specs_exports);
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
const CARD_FILES = {
  orchestrator: "orchestrator-card.md",
  agent: "agent-card.md",
  droidspeak: "droidspeak-card.md",
  planner: "planner-agent-card.md",
  coding: "coding-agent-card.md"
};
let cachedSpecDir = null;
let cachedCards = null;
const safeReadCard = (specDir, fileName) => {
  const cardPath = import_node_path.default.resolve(specDir, fileName);
  if (!(0, import_node_fs.existsSync)(cardPath)) {
    return "";
  }
  return (0, import_node_fs.readFileSync)(cardPath, "utf8").trim();
};
const loadSpecCards = (specDir) => {
  const resolved = import_node_path.default.resolve(specDir);
  if (cachedSpecDir === resolved && cachedCards) {
    return cachedCards;
  }
  const cards = {};
  for (const [key, fileName] of Object.entries(CARD_FILES)) {
    cards[key] = safeReadCard(resolved, fileName);
  }
  cachedSpecDir = resolved;
  cachedCards = {
    orchestrator: cards.orchestrator || "",
    agent: cards.agent || "",
    droidspeak: cards.droidspeak || "",
    planner: cards.planner || "",
    coding: cards.coding || "",
    all: cards
  };
  return cachedCards;
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadSpecCards
});
