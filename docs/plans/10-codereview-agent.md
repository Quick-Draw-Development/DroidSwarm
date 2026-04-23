DroidSwarm Code Review Agent Implementation Plan
For Codex Agent Execution
Objective
Create a first-rate, specialized code-review-agent that lives inside the new dynamic agent framework (shared-skills + agent-builder).
The agent must:

Fully comply with all DroidSwarm laws, governance, Droidspeak, tracing, and role-based consensus rules.
Deliver constructive, high-signal code reviews for PRs that exactly match the 10 detailed requirements provided (objective/concise feedback, bug catching, test coverage analysis, security scanning, performance assessment, code quality enforcement, PR description validation, codebase pattern awareness, prioritized feedback categories, and actionable suggestions with code examples).
Automatically discoverable, registerable, and usable across the swarm (master + all slaves).

Key Principles

Treated as a first-class specialized agent via the new agent-builder (manifest-driven).
Internal reasoning and communication uses Droidspeak only.
All actions are logged to shared-tracing (tamper-evident).
Uses model-router (prefers Apple Intelligence on Mac for nuanced review reasoning).
Can be triggered automatically on PR events or manually via Slack/dashboard.
When a review decision could affect merge or codebase integrity, it triggers lightweight role-based consensus (Proposer/Reviewer/Verifier/Guardian/Arbitrator).
Focuses only on correctness, maintainability, performance, security, and consistency — skips nitpicks and fluff.

Phase 0: Skill & Agent Scaffolding

Use the existing skill creation CLI to generate:
skills/code-review-agent (Nx library).
Full manifest (manifest.json) declaring capabilities, required Droidspeak verbs, and backend preferences.

Register the skill via shared-skills registry so it is auto-discovered on startup and pushed to slaves.
Create the agent definition via DroidSwarm agent create code-review-agent --skills code-review-agent.

Phase 1: Core Review Engine
Implement the review logic in skills/code-review-agent/src/review-engine.ts with dedicated functions for every user requirement:

validatePRDescription(diff, prBody) → checks explanation, screenshots, test plan, breaking changes, risks.
analyzeCodeChanges(files, diff) → catches null pointers, off-by-one, race conditions, missing error handling, unclosed resources, infinite loops, type coercion, async/await bugs (with exact line references + suggested fixes).
checkTestCoverage(files, tests) → identifies untested paths, missing edge/error cases, suggests specific test cases.
scanSecurityIssues(files) → flags SQLi, XSS, auth issues, secrets, unsafe deserialization, CSRF, input validation (with risk explanation + secure alternative).
assessPerformance(files) → detects N+1 queries, inefficient algorithms, re-renders, blocking calls, memory leaks, missing pagination (with expected impact).
enforceCodeQuality(files) → checks cyclomatic complexity, duplication, naming, SOLID violations, documentation gaps.
assessCodebasePatterns(files) → learns and enforces project-specific conventions (error handling, structure, naming, testing patterns).
categorizeAndPrioritizeFeedback(findings) → outputs blocking / important / nice-to-have / question categories.
generateActionableSuggestion(issue) → always returns: problematic code snippet, why it’s bad, exact fix example, and benefit.

Phase 2: PR Integration & Workflow

Hook into existing git-flow enforcement in the orchestrator:
Auto-trigger on new PRs (or via manual DroidSwarm review <pr-id>).
Parse PR diff + metadata using built-in git tooling.

Add review workflow:
First: validate PR description → if incomplete, post clarification request to Slack/PR and pause.
Then: run full review engine.
Output structured review comment (markdown) with categorized feedback, line references, code examples, and clear blocking vs. non-blocking labels.


Phase 3: Droidspeak, Governance & Tracing Integration

Extend Droidspeak catalog with review-specific verbs (e.g., EVT-REVIEW-START, EVT-BUG-FLAG, EVT-SECURITY-FINDING, EVT-CONSENSUS-REVIEW).
All internal agent reasoning and inter-agent messages must use Droidspeak.
Wrap every review in a lightweight consensus round (if the PR touches critical paths) using the existing shared-governance consensus engine.
Log entire review (findings, consensus, final output) to shared-tracing with full audit trail.

Phase 4: User Interfaces & Controls

Update Slack bot with:
/droid review <pr-id> command.
Automatic posting of completed reviews to the relevant Slack channel.

Add dashboard panel:
“Code Reviews” tab showing pending/active reviews with status.
One-click trigger and view of full review output.

Add CLI: DroidSwarm review run <pr-id> [--project <name>].

Phase 5: Testing & Validation

Unit tests for each review capability (bug catching, security scan, test coverage suggestions, etc.).
Integration tests: simulate PR with known issues → verify exact line references, categorized feedback, actionable suggestions, and PR description handling.
End-to-end test: create a test PR → trigger review → confirm output in Slack and dashboard matches all 10 requirements.
Governance test: ensure review decisions that affect merge go through consensus and are fully traced.
Performance test: confirm a typical PR review completes in < 8 seconds on Apple Silicon.

Execution Instructions for Codex Agent

Follow phases strictly in order.
Commit after each phase with message:
code-review-agent: Phase X - [short description]
Reuse existing packages (shared-skills, agent-builder, shared-droidspeak, shared-governance, shared-tracing, model-router, orchestrator, Slack bot, dashboard) wherever possible.
Keep the agent fully modular and discoverable via the dynamic registry.
Ensure everything remains Mac-friendly, local-first, and compliant with all laws.
After completion, update SKILLS.md and AGENTS.md with full documentation and example usage.

This plan creates a production-grade code review agent that is a seamless, first-class member of the DroidSwarm ecosystem while delivering exactly the high-quality, constructive, and thorough reviews you specified.
Start with Phase 0.
