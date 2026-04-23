DroidSwarm Ralph Wiggum Persistent Worker Loop Plan
For Codex Agent Execution
Objective
Add a new specialized agent type — the ralph-wiggum-worker — that implements the classic Ralph Wiggum Loop pattern (simple, persistent while true iteration with external state).
This agent repeatedly attacks the same high-level goal using fresh context windows on every iteration, relying on DroidSwarm’s external long-term memory, git-flow enforcement, shared-persistence, and tracing to maintain progress and avoid context rot.
The model-router will be updated with clear reasoning rules so it automatically selects the Ralph worker for the right class of tasks (long-horizon refinement, self-correcting work, iterative polishing, research synthesis, etc.).
Key Principles

Ralph is a first-class specialized agent created via the existing agent-builder and shared-skills system.
It runs as a long-lived background worker (not a one-shot task).
Internal loop communication uses Droidspeak only.
Every iteration is fully logged to shared-tracing (tamper-evident).
Governance: any long-running Ralph session that could affect merge or critical state triggers lightweight role-based consensus.
Federation-aware: Ralph workers can run on slaves and report status to the master.
Model-router decides when to spawn/assign a Ralph worker based on task characteristics.

Phase 0: Ralph Worker Skill & Agent Definition

Create new skill: skills/ralph-wiggum-worker.
Define agent manifest with:
type: "persistent-loop"
capabilities: ["iterative-refinement", "self-correction", "long-horizon"]
loopConfig: { maxIterations: 50, completionSignal: "<RALPH_DONE>", sleepMs: 5000 }

Register via shared-skills so it auto-discovers and becomes available on master + slaves.

Phase 1: Core Ralph Loop Implementation

In skills/ralph-wiggum-worker/src/ralph-loop.ts implement the loop:TypeScriptwhile (!isComplete) {
  const task = await memoryStore.getCurrentGoal(projectId);     // external state
  const context = await memoryStore.retrieveRelevantMemories(task); // long-term memory

  const droidspeakPrompt = encoder.encodeTask(task, context);
  const result = await modelRouter.run(droidspeakPrompt);       // fresh context each time

  await memoryStore.updateProgress(result);                     // git + persistence
  await tracer.audit('RALPH_ITERATION', { iteration, result });

  if (result.containsCompletionSignal) break;
  await sleep(loopConfig.sleepMs);
}
Add graceful pause/resume, early termination on governance halt, and progress checkpointing.

Phase 2: Model-Router Reasoning Update

Extend model-router with new decision logic:
Trigger Ralph when task matches any of:
iterationCountExpected: "high" (e.g., > 8 iterations)
selfCorrectionNeeded: true
longHorizon: true (multi-hour or multi-day refinement)
polishingPhase: true (code review follow-up, research synthesis, iterative testing)
failureRecoveryMode: true (after previous failures)


Update selection matrix so Ralph is preferred over one-shot agents for these patterns.
Log routing decision with Droidspeak for auditability.

Phase 3: Orchestrator & Spawner Integration

Update agent-builder and worker-host to support spawning persistent Ralph workers.
Orchestrator can assign long-running goals to Ralph workers (via task queue or direct handoff).
Add lifecycle management: startRalphWorker(goalId), pauseRalphWorker(), statusRalphWorker().

Phase 4: Governance, Tracing & UI Integration

Hook into shared-governance: Ralph sessions that exceed iteration thresholds or touch critical paths trigger consensus (Guardian veto possible).
Extend Droidspeak catalog with RALPH_ITERATION, RALPH_DONE, RALPH_PAUSE.
Update Slack bot and dashboard:
/droid ralph start <goal>
/droid ralph status
Dashboard “Persistent Workers” tab showing live Ralph loops, iteration count, and progress.


Phase 5: Testing & Validation

Unit tests for loop logic, memory retrieval, and completion signal handling.
Integration tests: assign iterative coding task → verify multiple fresh-context iterations → confirm external state updates.
End-to-end: trigger via Slack → Ralph runs → governance monitors → completes with traceable audit trail.
Federation test: Ralph worker runs on a slave → master observes progress.
Routing test: model-router correctly selects Ralph for long-horizon vs. short tasks.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
ralph-worker: Phase X - [short description]
Reuse existing packages (shared-skills, agent-builder, model-router, shared-memory, shared-tracing, shared-governance, federation-bus, orchestrator, Slack bot, dashboard) wherever possible.
Keep the feature modular and optional (behind DROIDSWARM_ENABLE_RALPH=true).
Ensure everything remains Mac-friendly, local-first, secure, and compliant with all laws.
After completion, update AGENTS.md, SKILLS.md, and MODEL-ROUTING.md with Ralph worker documentation and routing criteria.

This addition gives DroidSwarm a powerful, battle-tested persistent iteration primitive that complements our existing reflection/evolution loop and makes long-running refinement tasks dramatically more reliable and efficient.
Start with Phase 0.