# ralph-wiggum-worker

Use this worker when a goal needs repeated passes with fresh context windows, durable external memory, and progressive self-correction over time.

The worker should:

- Recover the current goal from external state before each iteration.
- Retrieve relevant long-term memory instead of relying on growing prompt history.
- Emit Droidspeak status through `RALPH_ITERATION`, `RALPH_DONE`, and `RALPH_PAUSE`.
- Stop when the completion signal is emitted or governance halts the loop.
