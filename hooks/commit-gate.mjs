#!/usr/bin/env node
// PreToolUse (Bash): block `git commit` unless this session recorded a passing
// test run — and, in a TypeScript project, a passing typecheck too. Order is
// flexible: the checks may run any time in the session, not before writing code.
// A working tree whose only changes are known neutral artifacts is not gated.
import { spawnSync } from "node:child_process";
import {
  readInput,
  debug,
  deny,
  allow,
  readMarker,
  isTsProject,
  projectRoot,
  workingTreeFingerprint,
  isVerificationRelevantPath,
  nullDelimited,
} from "./_lib.mjs";

const input = await readInput();
debug("commit-gate", input);

const cmd = String(input?.tool_input?.command ?? "");
const c = cmd.replace(/\s+/g, " ").trim();

// Only gate real commits.
if (!/\bgit\s+commit\b/.test(c)) allow();
// Dry runs don't create commits.
if (/--dry-run\b/.test(c)) allow();

const root = projectRoot(input);

function gitPaths(args) {
  const result = spawnSync("git", args, { cwd: root, timeout: 5_000 });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;
  return nullDelimited(result.stdout);
}

// Everything that differs from HEAD right now: staged, unstaged, and untracked.
// The gate protects verification freshness of the working tree, not just of the
// staged set, so the whole delta decides. Null means the state is unreadable.
function changedPaths() {
  const groups = [
    gitPaths(["diff", "--cached", "--name-only", "-z"]),
    gitPaths(["diff", "--name-only", "-z"]),
    gitPaths(["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
  if (groups.some((group) => group === null)) return null;
  return groups.flat();
}

// A change set of only known neutral artifacts cannot have invalidated this
// session's checks, so it is not gated. An unreadable state stays gated.
const changed = changedPaths();
if (changed !== null && changed.every((path) => isVerificationRelevantPath(path) === false)) allow();

const marker = readMarker(input?.session_id, input);
const fingerprint = workingTreeFingerprint(root);

const missing = [];
const stale = [];
if (!marker.testPassedAt || !marker.testPassedFor)
  missing.push("a passing test run (must exit 0)");
else if (!fingerprint || marker.testPassedFor !== fingerprint)
  stale.push("Verification stale: code changed since last successful test run.");

if (isTsProject(root)) {
  if (!marker.typecheckPassedAt || !marker.typecheckPassedFor)
    missing.push("a passing typecheck (e.g. `tsc --noEmit` or your `typecheck` script)");
  else if (!fingerprint || marker.typecheckPassedFor !== fingerprint)
    stale.push("Verification stale: code changed since last successful typecheck.");
}

if (missing.length === 0 && stale.length === 0) allow();

const problems = [];
if (missing.length > 0) problems.push(`this session is missing ${missing.join(" and ")}.`);
problems.push(...stale);
deny(
  `Blocked by plus-ultra commit-gate: ${problems.join(" ")} ` +
    "Run the required checks (exit 0) before committing, then retry."
);
