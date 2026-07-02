#!/usr/bin/env node
// PostToolUse (Bash): when a test command completes successfully, write a
// per-session marker that commit-gate reads. Fail-closed: only write on a
// clear success signal.
import { mkdirSync, writeFileSync } from "node:fs";
import { readInput, debug, stateDir } from "./_lib.mjs";

const input = await readInput();
debug("test-marker", input);

const cmd = String(input?.tool_input?.command ?? "");
const sessionId = String(input?.session_id ?? "default");

// Does this look like a test-runner invocation?
const TEST_CMD =
  /(^|[;&|]\s*)(npx\s+)?(npm\s+(run\s+)?test\b|npm\s+t\b|yarn\s+(run\s+)?test\b|pnpm\s+(run\s+)?test\b|bun\s+test\b|vitest\b|jest\b|mocha\b|node\s+--test\b|ava\b)/;
if (!TEST_CMD.test(cmd)) process.exit(0);

// Success detection. tool_response shape is not fully documented, so probe the
// likely fields in priority order and fail-closed on ambiguity.
const resp = input?.tool_response ?? {};
const exit =
  resp.exitCode ?? resp.exit_code ?? resp.returnCode ?? resp.code ?? undefined;

let passed;
if (input?.tool_error === true || resp.interrupted === true) {
  passed = false;
} else if (typeof exit === "number") {
  passed = exit === 0;
} else {
  // No exit code exposed: scan combined output for explicit failure tokens.
  const text = [resp.stdout, resp.stderr, resp.output, typeof resp === "string" ? resp : ""]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const failure =
    /\b\d+\s+(failing|failed)\b/.test(text) ||
    /tests?\s+failed/.test(text) ||
    /\bfail(ed)?\b.*\b(suite|spec|test)/.test(text) ||
    /npm error|command failed|exit code [1-9]/.test(text);
  // Require an affirmative pass token AND no failure token.
  const success = /\b(pass(ed|ing)?|✓|ok\b|\d+\s+passing|tests?\s+passed)\b/.test(text);
  passed = success && !failure;
}

if (!passed) process.exit(0);

try {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}/${sessionId}.json`,
    JSON.stringify({ testPassedAt: new Date().toISOString(), command: cmd }, null, 2)
  );
} catch {
  // Never disrupt the session over a marker write failure.
}
process.exit(0);
