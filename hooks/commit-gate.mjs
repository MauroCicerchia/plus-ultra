#!/usr/bin/env node
// PreToolUse (Bash): block `git commit` unless this session recorded a passing
// test run — and, in a TypeScript project, a passing typecheck too. Order is
// flexible: the checks may run any time in the session, not before writing code.
import { readInput, debug, deny, allow, readMarker, isTsProject } from "./_lib.mjs";

const input = await readInput();
debug("commit-gate", input);

const cmd = String(input?.tool_input?.command ?? "");
const c = cmd.replace(/\s+/g, " ").trim();

// Only gate real commits.
if (!/\bgit\s+commit\b/.test(c)) allow();
// Dry runs don't create commits.
if (/--dry-run\b/.test(c)) allow();

const root = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
const marker = readMarker(input?.session_id);

const missing = [];
if (!marker.testPassedAt) missing.push("a passing test run (must exit 0)");
if (isTsProject(root) && !marker.typecheckPassedAt)
  missing.push("a passing typecheck (e.g. `tsc --noEmit` or your `typecheck` script)");

if (missing.length === 0) allow();

deny(
  `Blocked by plus-ultra commit-gate: this session is missing ${missing.join(" and ")}. ` +
    `Run ${missing.length > 1 ? "them" : "it"} (exit 0) before committing, then retry.`
);
