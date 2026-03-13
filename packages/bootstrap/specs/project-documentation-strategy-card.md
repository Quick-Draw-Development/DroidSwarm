# Project Documentation Strategy Card

Defines how DroidSwarm should create, inspect, maintain, and use project documentation inside the repository a swarm is working on. This card is intended for swarm setup and ongoing project work, not for documenting DroidSwarm itself.

## 1. Purpose

Project documentation exists to provide long-lived context for the swarm and for humans working with it.

The goals are to:

1. Preserve durable project understanding across tasks and swarm restarts
2. Give agents reliable architectural and workflow context before they act
3. Separate long-lived project knowledge from short-lived task execution state
4. Avoid generic or duplicate documentation that does not help future work

## 2. Core Principle

Documentation should support the project the swarm is attached to.

Do not generate a large documentation scaffold blindly. The swarm should first determine whether the target project is:

- a new/greenfield project being created from scratch
- an existing project that already has code, docs, and conventions

The documentation strategy must adapt to that mode.

## 3. Project Modes

### 3.1 Greenfield

Use this mode when the swarm is being attached to an empty or near-empty repository and the project is still being defined.

Signals:

- empty directory or nearly empty repo
- no meaningful app code yet
- no established architecture docs
- the immediate work is planning, requirements gathering, or initial design

In this mode, documentation is part of the planning process and becomes an early source of truth.

### 3.2 Existing Project

Use this mode when the swarm is being attached to an already functioning software project.

Signals:

- meaningful codebase already exists
- app/service entrypoints already exist
- docs may already exist
- work is primarily adding features, fixing bugs, or maintaining the system

In this mode, the swarm should inspect and respect existing project conventions before adding new documentation.

## 4. Document Categories

The swarm should treat project knowledge, tasks, and initiative planning as different layers.

### 4.1 Project Knowledge Docs

Long-lived context such as:

- architecture overview
- domain model
- major workflows
- system boundaries
- design decisions
- operating assumptions
- onboarding context for future agents

These docs should change when the project meaningfully changes.

### 4.2 Task Records

Short-lived execution state such as:

- task cards
- task status
- room/channel history
- artifacts
- handoffs
- trace records

Tasks are not a replacement for durable project docs.

### 4.3 Initiative Docs

Multi-task planning artifacts such as:

- epics
- migrations
- refactors
- releases
- staged rollouts

These may live in an `exec-plans` area when the scope justifies it.

## 5. When To Use `exec-plans`

`exec-plans` is useful, but it should not be mandatory for every task.

Use `exec-plans` when:

- work spans multiple tasks
- sequencing matters
- rollout or dependency planning matters
- humans need a plan artifact to review
- the initiative has decision points that outlive one task

Do not use `exec-plans` for:

- every small bug fix
- every minor feature
- routine maintenance already captured fully by one task

Rule of thumb:

- greenfield projects will often use `exec-plans` early
- existing projects should use `exec-plans` only for larger efforts

## 6. Setup Behavior By Mode

### 6.1 Greenfield Setup

During swarm setup for a greenfield project:

- initialize a project docs scaffold
- create initial architecture, product, and design docs
- create or enable an `exec-plans` area
- seed planning-oriented tasks
- treat docs as part of the planning deliverables

### 6.2 Existing Project Setup

During swarm setup for an existing project:

- inspect the real codebase first
- inspect existing docs first
- preserve the project’s current documentation style where possible
- only add DroidSwarm-managed docs where there are real gaps
- avoid duplicating docs that already exist and are adequate

## 7. Source Of Truth Rules

Different artifacts are authoritative for different kinds of knowledge.

- Code is the source of truth for implementation details
- Project docs are the source of truth for intended architecture, workflows, and durable decisions
- Tasks are the source of truth for active work state
- `exec-plans` are the source of truth for multi-task initiative sequencing when used

Agents should not confuse these layers.

## 8. Agent Responsibilities

Before planning or implementation, agents should:

- read the relevant project docs
- read project metadata and active task context
- identify whether the task implies a durable documentation change

During work, agents should:

- update project docs when architecture or workflow meaningfully changes
- avoid churn from trivial doc edits that do not add durable value
- link task decisions back to docs when the decision should outlive the task

After work, agents should:

- ensure any architecture-impacting change is reflected in the project docs
- ensure initiative docs stay aligned if the work was part of a larger plan

## 9. Orchestrator Responsibilities

The orchestrator should:

- determine project mode during setup
- decide whether docs scaffolding is needed
- require project docs to be read before planning significant work
- decide when a task requires documentation updates
- decide when an initiative should create or update an `exec-plans` artifact
- avoid documentation duplication in existing projects

## 10. Recommended Deliverables By Mode

### 10.1 Greenfield

Expected early docs:

- architecture overview
- product/workflow overview
- design decisions / core beliefs
- initiative or roadmap planning docs

### 10.2 Existing Project

Expected docs should be lighter unless gaps are found:

- architecture map or architecture delta notes
- known conventions and risks
- references to existing authoritative docs
- initiative docs only when the work scope warrants them

## 11. Anti-Patterns

Avoid:

- generating large placeholder doc trees with little substance
- copying task details into permanent docs
- rewriting healthy existing docs just to match DroidSwarm preferences
- forcing `exec-plans` onto routine work
- pretending architecture is known if it has not been inspected

## 12. Recommended Setup Decision

Swarm setup should support:

- `--project-mode greenfield`
- `--project-mode existing`

Explicit mode is preferred for MVP.

Inference can be used later as a fallback, but setup should not guess when the user can specify the mode clearly.

## 13. Practical Output Strategy

For greenfield projects, DroidSwarm may create a managed docs scaffold from the start.

For existing projects, DroidSwarm should:

- discover existing documentation locations
- register them as references in swarm metadata
- add new docs only where there is a clear need

This card should guide swarm setup and later planning behavior so project documentation remains useful context rather than administrative noise.
