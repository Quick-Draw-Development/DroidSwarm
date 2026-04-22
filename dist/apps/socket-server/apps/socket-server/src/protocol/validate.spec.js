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
var import_strict = __toESM(require("node:assert/strict"));
var import_node_test = __toESM(require("node:test"));
var import_validate = require("./validate");
(0, import_node_test.default)("parseAuthMessage accepts valid auth payloads", () => {
  const parsed = (0, import_validate.parseAuthMessage)(JSON.stringify({
    type: "auth",
    project_id: "droidswarm",
    timestamp: "2026-03-12T12:00:00.000Z",
    payload: {
      room_id: "operator",
      agent_name: "Orchestrator",
      agent_role: "orchestrator",
      client_type: "orchestrator",
      token: "secret"
    }
  }));
  import_strict.default.equal(parsed.payload.room_id, "operator");
  import_strict.default.equal(parsed.payload.client_type, "orchestrator");
});
(0, import_node_test.default)("parseMessageEnvelope rejects missing actor refs", () => {
  import_strict.default.throws(() => (0, import_validate.parseMessageEnvelope)(JSON.stringify({
    message_id: "msg-1",
    project_id: "droidswarm",
    room_id: "task-1",
    type: "status_update",
    timestamp: "2026-03-12T12:00:00.000Z",
    payload: {}
  })));
});
(0, import_node_test.default)("parseMessageEnvelope normalizes EnvelopeV2 compatibility fields", () => {
  const parsed = (0, import_validate.parseMessageEnvelope)(JSON.stringify({
    message_id: "msg-2",
    project_id: "droidswarm",
    room_id: "task-1",
    type: "plan_proposed",
    from: {
      actor_type: "agent",
      actor_id: "planner-1",
      actor_name: "planner"
    },
    timestamp: "2026-03-12T12:00:00.000Z",
    payload: {
      task_id: "task-1",
      plan_id: "plan-1",
      summary: "plan ready"
    }
  }));
  import_strict.default.equal(parsed.id, "msg-2");
  import_strict.default.equal(parsed.ts, "2026-03-12T12:00:00.000Z");
  import_strict.default.equal(parsed.verb, "plan.proposed");
  import_strict.default.deepEqual(parsed.body, {
    task_id: "task-1",
    plan_id: "plan-1",
    summary: "plan ready"
  });
});
(0, import_node_test.default)("parseCanonicalEnvelope preserves native EnvelopeV2 payloads", () => {
  const parsed = (0, import_validate.parseCanonicalEnvelope)(JSON.stringify({
    id: "env-1",
    ts: "2026-03-12T12:00:00.000Z",
    project_id: "droidswarm",
    room_id: "task-1",
    task_id: "task-1",
    agent_id: "planner-1",
    role: "planner",
    verb: "plan.proposed",
    body: {
      task_id: "task-1",
      summary: "native envelope"
    }
  }));
  import_strict.default.equal(parsed.id, "env-1");
  import_strict.default.equal(parsed.verb, "plan.proposed");
  import_strict.default.deepEqual(parsed.body, {
    task_id: "task-1",
    summary: "native envelope"
  });
});
(0, import_node_test.default)("parseIncomingEnvelope returns both canonical and legacy-compatible views", () => {
  const parsed = (0, import_validate.parseIncomingEnvelope)(JSON.stringify({
    message_id: "msg-3",
    project_id: "droidswarm",
    room_id: "task-1",
    type: "spawn_approved",
    from: {
      actor_type: "orchestrator",
      actor_id: "orch-1",
      actor_name: "orchestrator"
    },
    timestamp: "2026-03-12T12:00:00.000Z",
    payload: {
      task_id: "task-1",
      approved_agents: [],
      summary: "spawn approved"
    }
  }));
  import_strict.default.equal(parsed.canonical.verb, "spawn.approved");
  import_strict.default.equal(parsed.message.type, "spawn_approved");
  import_strict.default.equal(parsed.message.verb, "spawn.approved");
});
(0, import_node_test.default)("parseIncomingEnvelope rejects malformed droidspeak v2 payloads", () => {
  import_strict.default.throws(() => (0, import_validate.parseIncomingEnvelope)(JSON.stringify({
    message_id: "msg-4",
    project_id: "droidswarm",
    room_id: "task-1",
    type: "status_update",
    from: {
      actor_type: "agent",
      actor_id: "planner-1",
      actor_name: "planner"
    },
    timestamp: "2026-03-12T12:00:00.000Z",
    payload: {
      task_id: "task-1",
      status_code: "agent_blocked",
      content: "waiting on review",
      droidspeak: {
        compact: "state:blocked",
        expanded: "Waiting on review.",
        kind: "out_of_bounds_kind"
      }
    }
  })));
});
