#!/usr/bin/env node
// PreToolUse (Bash): block `git commit` unless tests passed this session.
// Order is flexible — tests may run any time in the session, not necessarily
// before writing code.
import { existsSync } from "node:fs";
import { readInput, debug, deny, allow, stateDir } from "./_lib.mjs";

const input = await readInput();
debug("commit-gate", input);

const cmd = String(input?.tool_input?.command ?? "");
const c = cmd.replace(/\s+/g, " ").trim();

// Only gate real commits.
if (!/\bgit\s+commit\b/.test(c)) allow();
// Dry runs and message-only edits don't create commits.
if (/--dry-run\b/.test(c)) allow();

const sessionId = String(input?.session_id ?? "default");
const marker = `${stateDir()}/${sessionId}.json`;

if (existsSync(marker)) allow();

deny(
  "Blocked by plus-ultra commit-gate: no passing test run recorded this session. " +
    "Run your test suite (it must exit 0) before committing, then retry the commit."
);
