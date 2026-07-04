#!/usr/bin/env node
// PostToolUse (Bash): when a test run OR a typecheck completes successfully,
// record it in the per-session marker that commit-gate reads. Fail-closed: only
// record on a clear success signal.
import { readInput, debug, mergeMarker } from "./_lib.mjs";

const input = await readInput();
debug("test-marker", input);

const cmd = String(input?.tool_input?.command ?? "");
const sessionId = String(input?.session_id ?? "default");

// Classify the command: a test runner or a typecheck. Neither → nothing to do.
// A package-manager prefix may carry flags between the pm and the script
// (e.g. `pnpm -r test`, `pnpm --filter web typecheck`), so allow flag tokens.
const PM = "(?:pnpm|npm|yarn|bun)";
const FLAG = "(?:run|exec|dlx|-{1,2}[\\w:=./-]+|--filter[= ]?\\S+)";
const PM_PREFIX = `${PM}(?:\\s+${FLAG})*\\s+`;
const A = "(?:^|[;&|]\\s*)"; // command start or a shell separator

// test runners (may stand alone or under a pm), pm test scripts, or `node --test`
const TEST_CMD = new RegExp(
  `${A}(?:` +
    `(?:npx\\s+)?(?:${PM_PREFIX})?(?:vitest|jest|mocha|ava)\\b` +
    `|(?:npx\\s+)?${PM_PREFIX}(?:test|t)\\b` +
    `|node\\s+--test\\b` +
    `)`
);
// tsc/vue-tsc directly, or a pm typecheck script
const TYPECHECK_CMD = new RegExp(
  `${A}(?:` +
    `(?:npx\\s+)?(?:${PM_PREFIX})?(?:tsc|vue-tsc)\\b` +
    `|(?:npx\\s+)?${PM_PREFIX}(?:typecheck|type-check)\\b` +
    `)`
);

const isTest = TEST_CMD.test(cmd);
const isTypecheck = TYPECHECK_CMD.test(cmd);
if (!isTest && !isTypecheck) process.exit(0);

// Success detection. tool_response shape is not fully documented, so probe the
// likely fields in priority order and fail-closed on ambiguity.
const resp = input?.tool_response ?? {};
const exit = resp.exitCode ?? resp.exit_code ?? resp.returnCode ?? resp.code ?? undefined;

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
    /error ts\d+:/.test(text) ||
    /npm error|command failed|exit code [1-9]/.test(text);
  const success =
    /\b(pass(ed|ing)?|✓|ok\b|\d+\s+passing|tests?\s+passed)\b/.test(text) ||
    (isTypecheck && !failure); // typecheck often prints nothing on success
  passed = success && !failure;
}

if (!passed) process.exit(0);

const now = new Date().toISOString();
const patch = {};
if (isTest) patch.testPassedAt = now;
if (isTypecheck) patch.typecheckPassedAt = now;
mergeMarker(sessionId, patch, input);
process.exit(0);
