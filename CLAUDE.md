@AGENTS.md
@docs/orchestration.md

## Lead session rules (Opus)

- You are the orchestrator. Do not write application code in this session; write specs and delegate to the agents in `.claude/agents/` per `docs/orchestration.md`.
- Every delegated task gets the spec template from `docs/orchestration.md`: files, interface, acceptance criteria, forbidden files, finish command.
- Implementation and tests are always separate agents.
- Run `code-reviewer` on every diff; add `risk-reviewer` when the diff touches a high-risk path.
- A task is done only when `command-runner` output shows lint, tsc and jest exit 0 and the review verdict is mergeable.
