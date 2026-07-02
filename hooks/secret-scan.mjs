#!/usr/bin/env node
// PreToolUse (Bash): before a `git commit`, scan the staged diff for obvious
// secrets and block if any are found. Deliberate blocker (like commit-gate).
// Fail open: if git is unavailable or anything errors, allow the commit.
import { spawnSync } from "node:child_process";
import { readInput, debug, deny, allow } from "./_lib.mjs";

const input = await readInput();
debug("secret-scan", input);

const cmd = String(input?.tool_input?.command ?? "");
const c = cmd.replace(/\s+/g, " ").trim();

if (!/\bgit\s+commit\b/.test(c)) allow();
if (/--dry-run\b/.test(c)) allow();

const root = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();

const git = (args) => {
  try {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 8000 });
    return r.status === 0 ? String(r.stdout ?? "") : null;
  } catch {
    return null;
  }
};

const findings = [];

// 1. Staged env files (allow the shareable *.example / *.sample / *.template).
const staged = git(["diff", "--cached", "--name-only"]);
if (staged === null) allow(); // no git / not a repo → don't disrupt
for (const f of staged.split("\n").map((s) => s.trim()).filter(Boolean)) {
  const base = f.split("/").pop();
  if (/(^|\.)env(\.|$)/.test(base) && !/\.(example|sample|template|dist)$/.test(base)) {
    findings.push(`staged env file: ${f}`);
  }
}

// 2. Secret-looking tokens in the added lines of the staged diff.
const diff = git(["diff", "--cached", "--unified=0"]);
const SECRETS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, "private key block"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/sk-ant-[A-Za-z0-9-]{20,}/, "Anthropic API key"],
  [/sk-[A-Za-z0-9]{32,}/, "OpenAI-style secret key"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
];
if (diff) {
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const [re, label] of SECRETS) {
      if (re.test(line)) findings.push(`${label} in added line`);
    }
  }
}

if (findings.length === 0) allow();

const unique = [...new Set(findings)];
deny(
  `Blocked by plus-ultra secret-scan: the staged changes look like they contain secrets:\n` +
    unique.map((f) => `  - ${f}`).join("\n") +
    `\nUnstage the secret, move it to an env var / secrets manager, and add the file to .gitignore. ` +
    `If this is a false positive, commit the specific safe paths deliberately.`
);
