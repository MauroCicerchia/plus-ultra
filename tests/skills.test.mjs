import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = new URL("..", import.meta.url).pathname;

function readRelative(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "skill has YAML frontmatter");

  return Object.fromEntries(
    match[1]
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        assert.notEqual(separator, -1, `frontmatter line has key/value: ${line}`);
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^"(.*)"$/, "$1");
        return [key, value];
      })
  );
}

test("pull-request-descriptions skill is packaged and discoverable", () => {
  const skillPath = "skills/pull-request-descriptions/SKILL.md";
  assert.ok(existsSync(join(repoRoot, skillPath)), `${skillPath} exists`);

  const skill = readRelative(skillPath);
  const frontmatter = parseFrontmatter(skill);

  assert.equal(frontmatter.name, "pull-request-descriptions");
  assert.match(frontmatter.description, /Use when/i);
  assert.match(frontmatter.description, /pull request|PR/i);

  for (const expectedSection of [
    "Context",
    "Summary",
    "Testing",
    "Risks",
    "Review Guidance",
  ]) {
    assert.match(skill, new RegExp(expectedSection, "i"));
  }

  const readme = readRelative("README.md");
  assert.match(readme, /pull-request-descriptions/);
});
