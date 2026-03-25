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
var import_node_module = __toESM(require("node:module"));
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
(function patchProtocolAlias() {
  const FLAG = Symbol.for("droidswarm.protocolAliasPatched");
  const moduleWithFlag = import_node_module.default;
  if (moduleWithFlag[FLAG]) {
    return;
  }
  moduleWithFlag[FLAG] = true;
  const aliasDir = (0, import_node_path.resolve)(__dirname, "../../protocol/src");
  const protocolRoots = [
    (0, import_node_path.resolve)(process.cwd(), "dist/packages/protocol/src"),
    (0, import_node_path.resolve)(process.cwd(), "packages/protocol/src"),
    aliasDir
  ];
  const protocolRoot = protocolRoots.find((root) => (0, import_node_fs.existsSync)(root));
  if (!protocolRoot) {
    return;
  }
  const moduleWithResolver = import_node_module.default;
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  moduleWithResolver._resolveFilename = function(request, parent, ...rest) {
    if (request === "@protocol" || request.startsWith("@protocol/")) {
      const subpath = request === "@protocol" ? "index" : request.slice("@protocol/".length);
      const candidate = resolveCandidate(protocolRoot, subpath);
      if (candidate) {
        return originalResolveFilename.call(this, candidate, parent, ...rest);
      }
    }
    return originalResolveFilename.apply(this, arguments);
  };
})();
function resolveCandidate(root, subpath) {
  const candidates = /* @__PURE__ */ new Set();
  candidates.add(subpath);
  if (!subpath.endsWith(".js")) {
    candidates.add(`${subpath}.js`);
  }
  if (!subpath.endsWith(".ts")) {
    candidates.add(`${subpath}.ts`);
  }
  for (const candidate of candidates) {
    const resolved = (0, import_node_path.join)(root, candidate);
    if ((0, import_node_fs.existsSync)(resolved)) {
      return resolved;
    }
  }
  return void 0;
}
