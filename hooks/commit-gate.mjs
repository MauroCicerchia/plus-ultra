#!/usr/bin/env node
// PreToolUse (Bash): block `git commit` unless this session recorded a passing
// test run — and, in a TypeScript project, a passing typecheck too. Order is
// flexible: the checks may run any time in the session, not before writing code.
// A working tree whose only changes are prose or images is not gated: those
// files cannot have invalidated the recorded verification.
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

// Paths that cannot invalidate a verification run: prose, images, and metadata
// files that no test, typecheck, lint, or build reads. Everything else is source.
const NON_SOURCE =
  /(?:^|\/)(?:LICENSE|NOTICE|CODEOWNERS|\.gitignore|\.gitattributes)$|\.(?:md|markdown|mdx|txt|rst|adoc|png|jpe?g|gif|svg|webp|ico|pdf)$/i;
const PLUGIN_STATE = /^(?:\.claude|\.codex)\/plus-ultra\/state\//;

function gitPaths(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 5_000 });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") return null;
  return result.stdout.split("\0").filter(Boolean);
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
  return groups.flat().filter((path) => !PLUGIN_STATE.test(path));
}

// A change set of only prose and images cannot have invalidated this session's
// test or typecheck run, so it is not gated. An unreadable state stays gated.
const changed = changedPaths();
if (changed !== null && changed.every((path) => NON_SOURCE.test(path))) allow();

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
