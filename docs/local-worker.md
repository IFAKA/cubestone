# Local Implementation Worker

Codex remains Cubestone's architect, planner, reviewer, and integrator. A repository-scoped Codex skill delegates selected bounded implementation tasks to Pi running the local Ornith model. `tools/local-worker.mjs` is the deterministic process boundary.

## Task contract

The runner accepts one JSON file with:

- `task_id`: non-empty identifier used for logs.
- `objective`: one bounded implementation outcome.
- `delegation_class`: required low-risk class: `mechanical`, `fixed_semantics`,
  `focused_test`, or `bounded_exploration`. Codex remains the default executor;
  this field is an explicit opt-in.
- `requires_diagnosis`: optional boolean. `true` is rejected because diagnosis
  and difficult debugging stay in Codex.
- `allowed_paths`: non-empty repository-relative path list.
- `forbidden_paths`: optional repository-relative path list; takes precedence over allowed paths.
- `context_files`: optional minimal repository-relative files the worker should read.
- `acceptance_criteria`: non-empty list of observable outcomes.
- `verification_commands`: optional exact commands the worker should run.
- `timeout_seconds`: optional integer from 30 through 180; default 120.
- `max_output_bytes`: optional integer from 65,536 through 1,048,576; default 512 KiB.
- `max_tool_calls`: optional integer from 1 through 6; default 6. The runner
  aborts when the seventh tool-call event is observed.

Paths may not escape the repository. Task input is capped at 64 KiB. The runner fixes provider `mlx`, model `/Users/faka/.omlx/models/ornith-ai/Ornith-1.5-35B-A3B-MLX-6bit`, and thinking `medium`; the endpoint defaults to `http://127.0.0.1:8080/v1` and may be overridden with `LOCAL_WORKER_ENDPOINT` for an externally managed compatible server. Sessions are ephemeral, and Pi uses a configured 49,152-token context/8,192-token output limit.

Run from the repository root:

```text
node tools/local-worker.mjs /tmp/cubestone-task.json
```

## Result contract

The runner gives Pi an isolated, per-run temporary agent directory containing only the local non-secret model configuration. This avoids global Pi session, credential, and lock-file coupling. It writes full Pi JSONL stdout, stderr, and `result.json` under the same unique system temporary directory. Its stdout is one compact JSON result containing:

- process exit code, signal, and spawn error;
- timeout, output-limit, or repetition guard state;
- endpoint/model identity and observed usage;
- event and parse-error counts;
- files whose content changed during the run;
- path-scope violations;
- a capped worker final response;
- full log and result paths;
- `acceptance: pending_codex_review` in every case.

Exit zero means only that Pi exited zero without a runner guard or detected scope violation. It never establishes correctness.

## Orchestrator policy

Delegate narrow, independently verifiable work when expected total cost is lower. Keep architecture, uncertain requirements, cross-cutting changes, security decisions, difficult diagnosis, review, and integration in Codex. Forbid unrelated dirty paths. Stop rather than ask Pi to redesign when assumptions fail.

After every run, Codex inspects the actual changed files and diff, evaluates scope, and reruns relevant verification. Retry a failed bounded approach at most once; then keep the work in Codex. Pi may not delegate recursively.

The default policy is deliberately conservative: more than six context files,
diagnostic work, time beyond two minutes, more than six tool calls, or output
above 512 KiB is a signal that expected rework cost is no longer favorable.
Codex should keep the task rather than raise these limits for ordinary work.

`events.usage` is the latest non-zero provider record. `usage_records` and
`usage_total_lower_bound` preserve completed-turn telemetry even when a guard
terminates the process; `usage_complete` is false for guarded or non-zero exits.
