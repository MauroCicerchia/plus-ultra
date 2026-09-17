import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { contextBudgets, validateContextBudgets } from "../scripts/check-context-budget.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;

function writeBudgetFiles(root, size = 0) {
  writeFileSync(join(root, "AGENTS.md"), "a".repeat(size));
  for (const skill of Object.keys(contextBudgets.skills)) {
    const path = join(root, "skills", skill);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "SKILL.md"), "a".repeat(size));
  }
}

test("context budget validation accepts files at their exact limits", () => {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-context-budget-"));
  try {
    writeBudgetFiles(root);
    writeFileSync(join(root, "AGENTS.md"), "a".repeat(contextBudgets.agents));
    for (const [skill, limit] of Object.entries(contextBudgets.skills)) {
      writeFileSync(join(root, "skills", skill, "SKILL.md"), "a".repeat(limit));
    }
    assert.deepEqual(validateContextBudgets(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("context budget validation reports every file above its limit", () => {
  const root = mkdtempSync(join(tmpdir(), "plus-ultra-context-budget-"));
  try {
    writeBudgetFiles(root);
    writeFileSync(join(root, "AGENTS.md"), "a".repeat(contextBudgets.agents + 1));
    writeFileSync(
      join(root, "skills", "pr-review", "SKILL.md"),
      "a".repeat(contextBudgets.skills["pr-review"] + 1)
    );
    writeFileSync(
      join(root, "skills", "context-handoffs", "SKILL.md"),
      "a".repeat(contextBudgets.skills["context-handoffs"] + 1)
    );
    const errors = validateContextBudgets(root);
    assert.equal(errors.length, 3);
    assert.match(errors[0], /AGENTS\.md.*2048/);
    assert.match(errors[1], /skills\/pr-review\/SKILL\.md.*4096/);
    assert.match(errors[2], /skills\/context-handoffs\/SKILL\.md.*2048/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CI runs the context budget check", () => {
  const workflow = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /node scripts\/check-context-budget\.mjs/);
});

test("verification skill has a bounded core budget", () => {
  assert.equal(contextBudgets.skills.verification, 2048);
});

test("context-handoffs skill has a bounded core budget", () => {
  assert.equal(contextBudgets.skills["context-handoffs"], 2048);
});
