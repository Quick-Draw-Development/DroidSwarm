# AGENTS root instructions

## Nx commands (mandatory)

- **Linting**: `npx nx lint`
- **Type checking**: `npx nx typecheck`
- **Testing**: `npx nx test`
- **App-specific verification**:
  - `npx nx test orchestrator`
  - `npx nx typecheck dashboard`
  - `npx nx test socket-server` (when relevant)

These commands must be used for their respective checks unless the user explicitly asks for alternatives.

## Prompt engineering library

Treat this file as a living system prompt. Each turn must follow the conventions below:

1. **System behavior summary**: State the working assumptions derived from the most recent conversation before producing recommendations.
2. **Few-shot guidance**: Align your tone and output format with the embedded examples.
3. **Chain-of-thought clarity**: When complex reasoning is required, expose the key steps in brief bullet form before the structured response.
4. **Structured final output**: Always emit JSON conforming to the schema defined below, and validate it mentally with Zod-style descriptions.

### Few-shot examples

```
Buyer: "Add a CLI flag for --dry-run that skips mutations but still reports findings."
Codex: "ASSUMPTIONS: CLI currently applies changes immediately. NEED: flag that simulates plan without applying.
CHAIN: 1) Inspect CLI command hierarchy. 2) Wire new flag parsing. 3) Ensure flag toggles mutation functions.
OUTPUT: {
  "summary": "Added --dry-run flag to CLI and documented behavior.",
  "actions": ["Update command parser", "Guard mutations behind flag", "Document in README"],
  "tests": ["npx nx test cli"],
  "followUp": []
}
```

```
Buyer: "The dashboard widgets still pull synthetic data; use persisted artifacts."
Codex: "ASSUMPTIONS: Placeholder strings exist in db helper. NEED: real datastore-backed sections.
CHAIN: 1) Inspect dashboard db util. 2) Identify real tables. 3) Replace placeholders. 4) Add type-safe adapters.
OUTPUT: { ... }
```

### Chain-of-thought guidance

- If the problem is multi-step, present 2‑4 bullet points describing the reasoning before the final JSON.
- Mention external constraints (e.g., migrations, backwards compatibility) explicitly in the chain of thought when relevant.
- Keep the narrative focused—don’t repeat the entire file contents, just the essentials of the decision path.

## Structured response schema (Zod + JSON Schema)

Every final reply must satisfy the schema below. Think in terms of Zod before emitting the response.

```ts
import { z } from 'zod';

export const CodexResponseSchema = z.object({
  summary: z.string().describe('High-level summary of changes or findings').max(500),
  reasoning: z.string().describe('Concise chain-of-thought or assumption list.'),
  actions: z.array(
    z.object({
      label: z.string(),
      detail: z.string(),
      status: z.enum(['done', 'in-progress', 'pending']),
      references: z.array(z.string()).optional(),
    }),
  ),
  tests: z.array(z.string()).describe('Exact Nx commands or verification steps run.'),
  followUp: z.array(z.string()).describe('Remaining questions or next steps to hand off.'),
});
```

When responding, format the JSON according to the schema above and mention that it adheres to the Zod definition. If the runtime cannot emit JSON directly (e.g., due to tool limitations), explicitly state the deviation and why.

### Response format reminder
- Always include the `summary`, `reasoning`, `actions`, `tests`, and `followUp` keys—even empty arrays.
- For `actions`, list each discrete change, its status, and any references (file paths, design notes, etc.).
- For `tests`, use the exact Nx commands from the Nx section unless extraordinary circumstances prevent them.
- For `followUp`, include unresolved questions or requested clarifications.

Failure to follow this structured format should be treated as non-compliance with the repo-level instructions.
