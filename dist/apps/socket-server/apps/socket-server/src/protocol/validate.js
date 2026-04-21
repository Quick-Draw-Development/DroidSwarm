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
var validate_exports = {};
__export(validate_exports, {
  isOperatorOnlyMessage: () => isOperatorOnlyMessage,
  parseAuthMessage: () => parseAuthMessage,
  parseMessageEnvelope: () => parseMessageEnvelope
});
module.exports = __toCommonJS(validate_exports);
var import_protocol = require("@protocol");
const parseAuthMessage = (input) => import_protocol.authMessageSchema.parse(JSON.parse(input));
const parseMessageEnvelope = (input) => (0, import_protocol.normalizeEnvelopeV2)(JSON.parse(input));
const isOperatorOnlyMessage = (type) => type === "task_created" || type === "task_intake_accepted";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isOperatorOnlyMessage,
  parseAuthMessage,
  parseMessageEnvelope
});
