#!/usr/bin/env node
// SessionStart: report a bounded summary and, only when unambiguous, one relevant spec.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readInput, debug, isCodexInput, projectRoot } from "./_lib.mjs";

const MAX_CONTEXT_BYTES = 1024;
const input = await readInput();
debug("session-start", input);

const frontmatterOf = (path) => {
  try {
    const text = readFileSync(path, "utf8");
    const fm = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    if (!fm) return null;
    const status = fm[1].match(
      /^[ \t]*status:[ \t]*(?:"([a-z-]+)"|'([a-z-]+)'|([a-z-]+))[ \t]*(?:#[^\r\n]*)?\r?$/im
    );
    const issue = fm[1].match(/^[ \t]*issue:[ \t]*([0-9]+)[ \t]*(?:#[^\r\n]*)?\r?$/im);
    const value = status?.[1] ?? status?.[2] ?? status?.[3];
    const number = issue?.[1];
    return {
      status: value?.toLowerCase(),
      issue: /^\d+$/.test(number ?? "") && Number(number) > 0 ? Number(number) : null,
    };
  } catch {
    return null;
  }
};

const branchIssues = (root) => {
  try {
    const result = spawnSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) return new Set();
    return new Set(
      result.stdout
        .trim()
        .split("/")
        .flatMap((component) => [...component.matchAll(/(?:^|-)issue-([1-9]\d*)(?=-|$)/g)])
        .map((match) => Number(match[1]))
    );
  } catch {
    return new Set();
  }
};

const truncateUtf8 = (value, maxBytes) => {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const suffix = "…";
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character + suffix, "utf8") > maxBytes) break;
    result += character;
  }
  return result + suffix;
};

const root = projectRoot(input);
const specsDir = `${root}/specs`;
let files;
try {
  files = readdirSync(specsDir).filter((file) => file.endsWith(".md")).sort();
} catch {
  process.exit(0);
}

const active = files
  .map((file) => ({ file, ...frontmatterOf(`${specsDir}/${file}`) }))
  .filter((spec) => spec.status === "approved" || spec.status === "draft");
if (active.length === 0) process.exit(0);

const issues = branchIssues(root);
const matches = active.filter((spec) => spec.issue !== null && issues.has(spec.issue));
const selected = matches.length === 1 ? matches[0] : null;
const lines = [
  "plus-ultra spec status:",
  `  - Approved: ${active.filter((spec) => spec.status === "approved").length}`,
  `  - Drafts: ${active.filter((spec) => spec.status === "draft").length}`,
];
if (selected) {
  const prefix = "  - Current spec: ";
  const suffix = ` (Issue #${selected.issue}, ${selected.status})`;
  lines.push(`${prefix}${truncateUtf8(selected.file, 256)}${suffix}`);
}
const context = truncateUtf8(`${lines.join("\n")}\n`, MAX_CONTEXT_BYTES);

if (isCodexInput(input)) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
} else {
  process.stdout.write(context);
}
