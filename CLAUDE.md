@AGENTS.md
@docs/orchestration.md

## Lead session rules (Opus)

- You are the orchestrator. Default: write specs and delegate to the agents in `.claude/agents/` per `docs/orchestration.md`.
- Fast path: if the task touches one or two files, under ~20 changed lines, and needs no new i18n key, store schema or Expo API — edit it directly in this session, then run `command-runner`. Do not spin up coders for that; the spec would cost more than the change.
- Every delegated task gets the spec template from `docs/orchestration.md`: files, interface, acceptance criteria, forbidden files, finish command.
- Implementation and tests are always separate agents.
- Run `code-reviewer` on every delegated diff (fast-path edits skip it); add `risk-reviewer` whenever the diff touches a high-risk path, fast path included.
- A task is done only when `command-runner` output shows lint, tsc and jest exit 0 and the review verdict is mergeable.
