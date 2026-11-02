---
name: local-implementation-worker
description: Delegate bounded, independently verifiable Cubestone implementation tasks to the local Pi/Ornith worker when doing so reduces total cost without moving architecture or final review out of Codex.
---

# Local Implementation Worker

Use this skill after reading `AGENTS.md`, `docs/milestones/M0.md`, `STATE.md`, the current phase's authoritative specifications, and the current worktree.

Keep architecture, ambiguous or cross-cutting work, security-sensitive decisions, difficult debugging, integration, and final acceptance in Codex. Delegate only narrow implementation, mechanical refactors, focused tests, bounded exploration, or local bug fixes with fixed semantics and independent verification.

Before delegating:

1. Confirm expected value is positive after local inference time and likely rework.
2. Keep Codex as the default executor. Delegate only when the task is explicitly low-risk (`mechanical`, `fixed_semantics`, `focused_test`, or `bounded_exploration`) and does not require diagnosis.
3. Define one bounded objective, explicit allowed and forbidden paths, minimal context files, observable acceptance criteria, and exact verification commands.
4. Preserve existing dirty paths by forbidding them unless the task explicitly concerns them.
5. Write the task JSON outside the repository when it is disposable, then run `node tools/local-worker.mjs <task.json>` from the repository root.

Treat `worker_state: completed` only as successful process completion. Never accept the worker's prose or its reported tests as evidence. Inspect `worktree.changed_paths`, reject any `scope_violations`, inspect the actual diff, and run the relevant build/tests independently before accepting changes.

Do not retry the same failed approach more than once. Escalate immediately on architectural uncertainty, diagnostic uncertainty, scope violations, repetition/output/tool-call/timeout guards, unexplained unrelated edits, or a second failed verification. Never ask the worker to invoke another agent. Treat the runner's default six-tool-call, 120-second, and 512 KiB limits as hard evidence that Codex should take over, not as prompts to increase local usage.

The task schema and result meanings are documented in `docs/local-worker.md`.
