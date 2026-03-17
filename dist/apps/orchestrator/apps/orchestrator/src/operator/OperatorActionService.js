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
var OperatorActionService_exports = {};
__export(OperatorActionService_exports, {
  OperatorActionService: () => OperatorActionService
});
module.exports = __toCommonJS(OperatorActionService_exports);
class OperatorActionService {
  constructor(persistenceService, supervisor) {
    this.persistenceService = persistenceService;
    this.supervisor = supervisor;
  }
  execute(action, taskId, operatorName, detail) {
    this.persistenceService.recordOperatorAction({
      taskId,
      actionType: action.type,
      detail,
      metadata: {
        operator: operatorName,
        priority: action.priority
      }
    });
    switch (action.type) {
      case "cancel_task": {
        const removedAgents = this.supervisor.cancelTask(taskId);
        this.persistenceService.setTaskStatus(taskId, "cancelled");
        return {
          actionType: action.type,
          detail,
          removedAgents
        };
      }
      case "request_review": {
        this.persistenceService.setTaskStatus(taskId, "in_review");
        return {
          actionType: action.type,
          detail,
          reviewRequested: true
        };
      }
      case "reprioritize": {
        if (action.priority) {
          this.persistenceService.updateTaskPriority(taskId, action.priority);
        }
        return {
          actionType: action.type,
          detail,
          priority: action.priority
        };
      }
    }
    return {
      actionType: action.type,
      detail
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OperatorActionService
});
