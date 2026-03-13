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
  authMessageSchema: () => authMessageSchema,
  isOperatorOnlyMessage: () => isOperatorOnlyMessage,
  messageEnvelopeSchema: () => messageEnvelopeSchema,
  parseAuthMessage: () => parseAuthMessage,
  parseMessageEnvelope: () => parseMessageEnvelope
});
module.exports = __toCommonJS(validate_exports);
var import_zod = require("zod");
var import_types = require("../types");
const isoTimestampSchema = import_zod.z.string().datetime({ offset: true });
const compressionSchema = import_zod.z.object({
  scheme: import_zod.z.string().min(1),
  compressed_content: import_zod.z.string().min(1)
});
const usageSchema = import_zod.z.object({
  total_tokens: import_zod.z.number().int().nonnegative().optional(),
  input_tokens: import_zod.z.number().int().nonnegative().optional(),
  cached_input_tokens: import_zod.z.number().int().nonnegative().optional(),
  output_tokens: import_zod.z.number().int().nonnegative().optional(),
  reasoning_output_tokens: import_zod.z.number().int().nonnegative().optional()
});
const actorRefSchema = import_zod.z.object({
  actor_type: import_zod.z.enum(import_types.ACTOR_TYPES),
  actor_id: import_zod.z.string().min(1),
  actor_name: import_zod.z.string().min(1)
});
const nonAuthMessageTypes = import_types.MESSAGE_TYPES.filter((messageType) => messageType !== "auth");
const authPayloadSchema = import_zod.z.object({
  room_id: import_zod.z.string().min(1),
  agent_name: import_zod.z.string().min(1),
  agent_role: import_zod.z.string().min(1),
  client_type: import_zod.z.enum(import_types.CLIENT_TYPES).optional(),
  token: import_zod.z.string().min(1).optional()
});
const authMessageSchema = import_zod.z.object({
  type: import_zod.z.literal("auth"),
  project_id: import_zod.z.string().min(1),
  timestamp: isoTimestampSchema,
  payload: authPayloadSchema
});
const messageEnvelopeSchema = import_zod.z.object({
  message_id: import_zod.z.string().min(1),
  project_id: import_zod.z.string().min(1),
  room_id: import_zod.z.string().min(1),
  task_id: import_zod.z.string().min(1).optional(),
  type: import_zod.z.enum(nonAuthMessageTypes),
  from: actorRefSchema,
  timestamp: isoTimestampSchema,
  payload: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()),
  reply_to: import_zod.z.string().min(1).optional(),
  trace_id: import_zod.z.string().min(1).optional(),
  span_id: import_zod.z.string().min(1).optional(),
  session_id: import_zod.z.string().min(1).optional(),
  usage: usageSchema.optional(),
  compression: compressionSchema.optional()
});
const parseAuthMessage = (input) => authMessageSchema.parse(JSON.parse(input));
const parseMessageEnvelope = (input) => messageEnvelopeSchema.parse(JSON.parse(input));
const isOperatorOnlyMessage = (type) => type === "task_created" || type === "task_intake_accepted";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  authMessageSchema,
  isOperatorOnlyMessage,
  messageEnvelopeSchema,
  parseAuthMessage,
  parseMessageEnvelope
});
