#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const contextBudgets = Object.freeze({
  agents: 2048,
  skills: Object.freeze({
    "pr-review": 4096,
    "design-artifacts": 4096,
    "new-project": 4096,
    verification: 2048,
    "context-handoffs": 2048,
  }),
});

const entries = () => [
  ["AGENTS.md", contextBudgets.agents],
  ...Object.entries(contextBudgets.skills).map(([skill, limit]) => [`skills/${skill}/SKILL.md`, limit]),
];

export function validateContextBudgets(root) {
  return entries().flatMap(([path, limit]) => {
    const target = resolve(root, path);
    if (!existsSync(target)) return [`${path} is missing`];
    const bytes = Buffer.byteLength(readFileSync(target, "utf8"), "utf8");
    return bytes > limit ? [`${path} is ${bytes} bytes; limit is ${limit} bytes`] : [];
  });
}

export function runContextBudgetCheck(root) {
  const errors = validateContextBudgets(root);
  if (errors.length === 0) {
    process.stdout.write("Context budget check passed.\n");
    return 0;
  }
  process.stderr.write(`Context budget check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  return 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  process.exitCode = runContextBudgetCheck(process.argv[2] ?? process.cwd());
}
