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
var audit_exports = {};
__export(audit_exports, {
  writeAuditEvent: () => writeAuditEvent
});
module.exports = __toCommonJS(audit_exports);
var import_node_crypto = require("node:crypto");
const writeAuditEvent = (persistence, input) => {
  persistence.recordAuditEvent({
    auditEventId: (0, import_node_crypto.randomUUID)(),
    projectId: input.projectId,
    taskId: input.taskId,
    channelId: input.channelId,
    connectionId: input.connectionId,
    traceId: input.traceId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    details: input.details,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  writeAuditEvent
});
//# sourceMappingURL=audit.js.map
