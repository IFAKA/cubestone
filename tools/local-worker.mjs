#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL = "/Users/faka/.omlx/models/ornith-ai/Ornith-1.5-35B-A3B-MLX-6bit";
const DEFAULT_ENDPOINT = process.env.LOCAL_WORKER_ENDPOINT ?? "http://127.0.0.1:8080/v1";
const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_TIMEOUT_SECONDS = 180;
const DEFAULT_OUTPUT_BYTES = 512 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOOL_CALLS = 6;
const MAX_TOOL_CALLS = 6;
const MAX_CONTEXT_FILES = 6;
const MAX_TASK_BYTES = 64 * 1024;
const REPEAT_LIMIT = 8;
const SNAPSHOT_IGNORES = new Set([".git", "build-native", "build-desktop", "node_modules"]);
const DELEGATION_CLASSES = new Set(["mechanical", "fixed_semantics", "focused_test", "bounded_exploration"]);

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

function normalizeRepoPath(repo, value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty path string`);
  }
  const absolute = resolve(repo, value);
  if (!isInside(repo, absolute)) throw new Error(`${label} escapes the repository: ${value}`);
  return relative(repo, absolute) || ".";
}

function pathMatches(path, roots) {
  return roots.some((root) => root === "." || path === root || path.startsWith(`${root}/`));
}

async function snapshotTree(repo) {
  const files = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const rel = relative(repo, absolute).split(sep).join("/");
      if (entry.isDirectory()) {
        if (SNAPSHOT_IGNORES.has(entry.name) || entry.name.startsWith("build-")) continue;
        await visit(absolute);
      } else if (entry.isFile()) {
        const data = await readFile(absolute);
        files.set(rel, createHash("sha256").update(data).digest("hex"));
      }
    }
  }
  await visit(repo);
  return files;
}

function changedPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

function validateTask(raw, repo) {
  const requiredStrings = ["task_id", "objective"];
  for (const key of requiredStrings) {
    if (typeof raw[key] !== "string" || raw[key].trim().length === 0) {
      throw new Error(`${key} must be a non-empty string`);
    }
  }
  if (!Array.isArray(raw.allowed_paths) || raw.allowed_paths.length === 0) {
    throw new Error("allowed_paths must be a non-empty array");
  }
  if (!DELEGATION_CLASSES.has(raw.delegation_class)) {
    throw new Error("delegation_class must be mechanical, fixed_semantics, focused_test, or bounded_exploration");
  }
  if (raw.requires_diagnosis === true) {
    throw new Error("diagnostic work stays with Codex; do not delegate it");
  }
  if (!Array.isArray(raw.acceptance_criteria) || raw.acceptance_criteria.length === 0) {
    throw new Error("acceptance_criteria must be a non-empty array");
  }
  const stringArray = (key) => {
    const value = raw[key] ?? [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`${key} must be an array of non-empty strings`);
    }
    return value;
  };
  const timeoutSeconds = raw.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS;
  const maxOutputBytes = raw.max_output_bytes ?? DEFAULT_OUTPUT_BYTES;
  const maxToolCalls = raw.max_tool_calls ?? DEFAULT_MAX_TOOL_CALLS;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > MAX_TIMEOUT_SECONDS) {
    throw new Error(`timeout_seconds must be an integer from 30 to ${MAX_TIMEOUT_SECONDS}`);
  }
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 65536 || maxOutputBytes > MAX_OUTPUT_BYTES) {
    throw new Error(`max_output_bytes must be an integer from 65536 to ${MAX_OUTPUT_BYTES}`);
  }
  if (!Number.isInteger(maxToolCalls) || maxToolCalls < 1 || maxToolCalls > MAX_TOOL_CALLS) {
    throw new Error(`max_tool_calls must be an integer from 1 to ${MAX_TOOL_CALLS}`);
  }
  if (raw.context_files?.length > MAX_CONTEXT_FILES) {
    throw new Error(`context_files exceeds the low-risk delegation limit of ${MAX_CONTEXT_FILES}; keep diagnosis in Codex`);
  }
  if (raw.requires_diagnosis !== undefined && typeof raw.requires_diagnosis !== "boolean") {
    throw new Error("requires_diagnosis must be boolean when provided");
  }
  return {
    taskId: raw.task_id.trim(),
    objective: raw.objective.trim(),
    allowedPaths: raw.allowed_paths.map((path, i) => normalizeRepoPath(repo, path, `allowed_paths[${i}]`)),
    forbiddenPaths: stringArray("forbidden_paths").map((path, i) =>
      normalizeRepoPath(repo, path, `forbidden_paths[${i}]`),
    ),
    contextFiles: stringArray("context_files").map((path, i) =>
      normalizeRepoPath(repo, path, `context_files[${i}]`),
    ),
    acceptanceCriteria: stringArray("acceptance_criteria"),
    verificationCommands: stringArray("verification_commands"),
    timeoutSeconds,
    maxOutputBytes,
    maxToolCalls,
    delegationClass: raw.delegation_class,
  };
}

function buildPrompt(task) {
  const section = (title, values) => `${title}:\n${values.length ? values.map((v) => `- ${v}`).join("\n") : "- none"}`;
  return [
    "You are a bounded implementation worker. Complete only the task below in the current repository.",
    "Read AGENTS.md first and obey it. Read only the listed context files plus files directly required to perform the task.",
    "Do not redesign architecture, broaden scope, commit, push, or invoke another coding agent (including pi or codex).",
    "This is low-risk delegated work only; stop if diagnosis, ambiguity, or architecture changes are required.",
    "Do not edit outside allowed paths. Treat forbidden paths as absolute prohibitions even if they overlap allowed paths.",
    "If an assumption fails, a required interface must change, or the task cannot be completed safely, stop and report the blocker.",
    "Work in small steps. Compile or run the listed verification promptly after editing; do not claim success without command output.",
    "Your final response must be compact: changes made, commands run with exit status, and blockers. The orchestrator will independently inspect everything.",
    `Task ID: ${task.taskId}`,
    `Objective: ${task.objective}`,
    section("Allowed paths", task.allowedPaths),
    section("Forbidden paths", task.forbiddenPaths),
    section("Required context files", task.contextFiles),
    section("Acceptance criteria", task.acceptanceCriteria),
    section("Verification commands", task.verificationCommands),
  ].join("\n\n");
}

function recordUsage(state, candidate, completed = false) {
  if (!candidate || typeof candidate.totalTokens !== "number" || candidate.totalTokens <= 0) return;
  state.latest = candidate;
  if (completed) {
    state.totalLowerBound += candidate.totalTokens;
    state.records += 1;
  }
}

function shouldStopForToolCalls(count, limit) {
  return count > limit;
}

async function preflight(endpoint, model) {
  const response = await fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`model endpoint returned HTTP ${response.status}`);
  const body = await response.json();
  const ids = Array.isArray(body.data) ? body.data.map((item) => item.id) : [];
  if (!ids.includes(model) && !ids.some((id) => basename(id) === basename(model))) {
    throw new Error(`configured model is not served: ${model}`);
  }
  return ids;
}

async function main() {
  if (process.argv.length !== 3 || ["-h", "--help"].includes(process.argv[2])) {
    process.stdout.write("Usage: node tools/local-worker.mjs <task.json>\n");
    process.exit(process.argv.length === 3 ? 0 : 2);
  }
  const repo = resolve(process.cwd());
  const taskPath = resolve(process.argv[2]);
  if (!(await stat(taskPath)).isFile()) fail(`Task is not a file: ${taskPath}`);
  const taskBytes = await readFile(taskPath);
  if (taskBytes.length > MAX_TASK_BYTES) fail(`Task exceeds ${MAX_TASK_BYTES} bytes`);

  let task;
  try {
    task = validateTask(JSON.parse(taskBytes.toString("utf8")), repo);
    await preflight(DEFAULT_ENDPOINT, DEFAULT_MODEL);
  } catch (error) {
    fail(`Preflight failed: ${error.message}`);
  }

  const runDirectory = await mkdtemp(join(tmpdir(), `cubestone-worker-${task.taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}-`));
  const stdoutPath = join(runDirectory, "stdout.jsonl");
  const stderrPath = join(runDirectory, "stderr.log");
  const piAgentDirectory = join(runDirectory, "pi-agent");
  await mkdir(piAgentDirectory);
  await writeFile(
    join(piAgentDirectory, "models.json"),
    `${JSON.stringify({
      providers: {
        mlx: {
          baseUrl: DEFAULT_ENDPOINT,
          api: "openai-completions",
          apiKey: "local-worker",
          models: [{
            id: DEFAULT_MODEL,
            name: "Ornith 1.5 Local Worker",
            reasoning: true,
            input: ["text"],
            contextWindow: 49152,
            maxTokens: 8192,
            compat: { supportsDeveloperRole: false, thinkingFormat: "qwen" },
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          }],
        },
      },
    }, null, 2)}\n`,
  );
  const before = await snapshotTree(repo);
  const startedAt = new Date();
  const prompt = buildPrompt(task);
  const args = [
    "--mode", "json", "--no-session", "--approve", "--no-extensions", "--no-skills", "--no-prompt-templates",
    "--provider", "mlx", "--model", DEFAULT_MODEL, "--api-key", "local-worker", "--thinking", "medium", prompt,
  ];
  const child = spawn("pi", args, {
    cwd: repo,
    env: { ...process.env, PI_CODING_AGENT_DIR: piAgentDirectory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let guard = null;
  let lastFragment = "";
  let repeatedFragments = 0;
  let finalText = "";
  const usageState = { latest: null, totalLowerBound: 0, records: 0 };
  let eventCount = 0;
  let toolCallCount = 0;
  let parseErrors = 0;
  let lineBuffer = "";

  const stop = (reason) => {
    if (guard) return;
    guard = reason;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000).unref();
  };
  const consumeLine = (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      eventCount += 1;
      recordUsage(usageState, event.usage);
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const textParts = event.message.content?.filter((part) => part.type === "text").map((part) => part.text) ?? [];
        finalText = textParts.join("\n");
        recordUsage(usageState, event.message.usage, true);
      }
      if (event.type === "tool_execution_start") {
        toolCallCount += 1;
        if (shouldStopForToolCalls(toolCallCount, task.maxToolCalls)) stop("tool_call_limit");
      }
      const fragment = event.assistantMessageEvent?.delta;
      if (typeof fragment === "string" && fragment.trim().length >= 80) {
        const normalized = fragment.replace(/\s+/g, " ").trim().slice(0, 512);
        repeatedFragments = normalized === lastFragment ? repeatedFragments + 1 : 0;
        lastFragment = normalized;
        if (repeatedFragments >= REPEAT_LIMIT) stop("repetition_detected");
      }
    } catch {
      parseErrors += 1;
    }
  };
  child.stdout.on("data", (chunk) => {
    stdout = Buffer.concat([stdout, chunk]);
    if (stdout.length + stderr.length > task.maxOutputBytes) stop("output_limit_exceeded");
    lineBuffer += chunk.toString("utf8");
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() ?? "";
    lines.forEach(consumeLine);
  });
  child.stderr.on("data", (chunk) => {
    stderr = Buffer.concat([stderr, chunk]);
    if (stdout.length + stderr.length > task.maxOutputBytes) stop("output_limit_exceeded");
  });
  const timeout = setTimeout(() => stop("timeout"), task.timeoutSeconds * 1000);
  const processResult = await new Promise((resolveResult) => {
    child.on("error", (error) => resolveResult({ exitCode: null, signal: null, spawnError: error.message }));
    child.on("close", (exitCode, signal) => resolveResult({ exitCode, signal, spawnError: null }));
  });
  clearTimeout(timeout);
  if (lineBuffer) consumeLine(lineBuffer);
  await Promise.all([writeFile(stdoutPath, stdout), writeFile(stderrPath, stderr)]);

  const after = await snapshotTree(repo);
  const changed = changedPaths(before, after);
  const scopeViolations = changed.filter(
    (path) => !pathMatches(path, task.allowedPaths) || pathMatches(path, task.forbiddenPaths),
  );
  const endedAt = new Date();
  const result = {
    schema_version: 1,
    task_id: task.taskId,
    worker_state: guard ?? (processResult.exitCode === 0 ? "completed" : "failed"),
    acceptance: "pending_codex_review",
    process: processResult,
    timing: { started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(), elapsed_ms: endedAt - startedAt },
    model: { provider: "mlx", id: DEFAULT_MODEL, endpoint: DEFAULT_ENDPOINT, thinking: "medium" },
    events: {
      count: eventCount,
      parse_errors: parseErrors,
      tool_calls: toolCallCount,
      usage: usageState.latest,
      usage_records: usageState.records,
      usage_total_lower_bound: usageState.totalLowerBound,
      usage_complete: guard === null && processResult.exitCode === 0,
    },
    worktree: { changed_paths: changed, scope_violations: scopeViolations },
    worker_final_text: finalText.slice(0, 4000),
    logs: { stdout: stdoutPath, stderr: stderrPath, stdout_bytes: stdout.length, stderr_bytes: stderr.length },
  };
  const resultPath = join(runDirectory, "result.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ...result, result_path: resultPath })}\n`);
  process.exit(guard || processResult.exitCode !== 0 || scopeViolations.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.stack ?? error.message));
}

export { recordUsage, shouldStopForToolCalls, validateTask };
