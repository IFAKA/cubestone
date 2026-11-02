#!/usr/bin/env node

import assert from "node:assert/strict";
import { recordUsage, shouldStopForToolCalls, validateTask } from "./local-worker.mjs";

const repo = process.cwd();
const base = {
  task_id: "policy-test",
  objective: "Make one bounded mechanical change",
  delegation_class: "mechanical",
  allowed_paths: ["tools/local-worker.mjs"],
  context_files: ["AGENTS.md"],
  acceptance_criteria: ["the change is observable"],
  verification_commands: [],
};

assert.equal(validateTask(base, repo).maxToolCalls, 6);
assert.throws(() => validateTask({ ...base, requires_diagnosis: true }, repo), /diagnostic work stays with Codex/);
assert.throws(
  () => validateTask({ ...base, context_files: Array.from({ length: 7 }, (_, i) => `f${i}`) }, repo),
  /context_files exceeds/,
);
assert.throws(() => validateTask({ ...base, timeout_seconds: 181 }, repo), /timeout_seconds/);
assert.throws(() => validateTask({ ...base, max_output_bytes: 1024 * 1024 + 1 }, repo), /max_output_bytes/);
assert.throws(() => validateTask({ ...base, max_tool_calls: 7 }, repo), /max_tool_calls/);

const usageState = { latest: null, totalLowerBound: 0, records: 0 };
recordUsage(usageState, { input: 1, output: 2, cacheRead: 3, totalTokens: 6 });
recordUsage(usageState, { input: 0, output: 0, cacheRead: 0, totalTokens: 0 });
recordUsage(usageState, { input: 4, output: 5, cacheRead: 6, totalTokens: 15 }, true);
assert.equal(usageState.latest.totalTokens, 15);
assert.equal(usageState.totalLowerBound, 15);
assert.equal(usageState.records, 1);

assert.equal(shouldStopForToolCalls(6, 6), false);
assert.equal(shouldStopForToolCalls(7, 6), true);

console.log("local-worker policy tests passed");
