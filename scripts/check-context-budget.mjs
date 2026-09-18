#!/usr/bin/env node
// Mechanical complexity budget. Plus Ultra's failure mode is growth, so the
// always-loaded surface has a hard ceiling: every skill's SKILL.md and the
// repository's own AGENTS.md. Detailed material belongs in an on-demand
// reference, which this check deliberately ignores.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const contextBudgets = Object.freeze({
  agents: 2048,
  skillDefault: 4096,
  // implement-issue carries the whole Issue-to-PR path; it gets more room than
  // the capabilities that feed it, and still has a ceiling.
  skills: Object.freeze({ "implement-issue": 4608 }),
  // At most five user-facing capabilities plus the policies they share.
  maxSkills: 8,
});

function skillNames(root) {
  try {
    return readdirSync(resolve(root, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function validateContextBudgets(root) {
  const errors = [];
  const skills = skillNames(root);

  if (skills.length === 0) errors.push("skills/ contains no skill directories");
  if (skills.length > contextBudgets.maxSkills) {
    errors.push(
      `skills/ has ${skills.length} skills; the budget is ${contextBudgets.maxSkills}. ` +
        "Remove an abstraction instead of raising this number."
    );
  }

  const entries = [
    ["AGENTS.md", contextBudgets.agents],
    ...skills.map((skill) => [
      `skills/${skill}/SKILL.md`,
      contextBudgets.skills[skill] ?? contextBudgets.skillDefault,
    ]),
  ];

  for (const [path, limit] of entries) {
    const target = resolve(root, path);
    if (!existsSync(target)) {
      errors.push(`${path} is missing`);
      continue;
    }
    const bytes = Buffer.byteLength(readFileSync(target, "utf8"), "utf8");
    if (bytes > limit) errors.push(`${path} is ${bytes} bytes; limit is ${limit} bytes`);
  }

  return errors;
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
