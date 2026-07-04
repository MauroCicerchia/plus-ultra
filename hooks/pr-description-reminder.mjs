#!/usr/bin/env node
// PostToolUse (Bash): after a successful `git commit`, remind the agent to
// review the open PR description. This hook never edits GitHub state.
import { spawnSync } from "node:child_process";
import { readInput, debug, mergeMarker, readMarker } from "./_lib.mjs";

const input = await readInput();
debug("pr-description-reminder", input);

function toolCommand(payload) {
  return String(payload?.tool_input?.command ?? "").replace(/\s+/g, " ").trim();
}

function commandSucceeded(payload) {
  const resp = payload?.tool_response ?? {};
  const exit = resp.exitCode ?? resp.exit_code ?? resp.returnCode ?? resp.code;
  return payload?.tool_error !== true && resp.interrupted !== true && exit === 0;
}

function run(command, args, cwd) {
  try {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) return null;
    return result.stdout.trim();
  } catch {
    return null;
  }
}

const cmd = toolCommand(input);
if (!/\bgit\s+commit\b/.test(cmd) || /--dry-run\b/.test(cmd)) process.exit(0);
if (!commandSucceeded(input)) process.exit(0);

const cwd = input?.cwd || process.cwd();
const head = run("git", ["rev-parse", "--short", "HEAD"], cwd);
if (!head) process.exit(0);

const marker = readMarker(input?.session_id, input);
if (marker.prDescriptionReminderHead === head) process.exit(0);

const prJson = run("gh", ["pr", "view", "--json", "number,url"], cwd);
if (!prJson) process.exit(0);

let pr;
try {
  pr = JSON.parse(prJson);
} catch {
  process.exit(0);
}

if (!pr?.number || !pr?.url) process.exit(0);

mergeMarker(
  input?.session_id,
  {
    prDescriptionReminderHead: head,
    prDescriptionReminderPr: pr.number,
    prDescriptionReminderAt: new Date().toISOString(),
  },
  input
);

process.stdout.write(
  `PR #${pr.number} may need a description update after ${head}. ` +
    `Use pull-request-descriptions and gh pr edit: ${pr.url}\n`
);
