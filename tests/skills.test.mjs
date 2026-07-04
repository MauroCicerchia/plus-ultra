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

test("engineering-principles skill is packaged and connected to project workflow", () => {
  const skillPath = "skills/engineering-principles/SKILL.md";
  assert.ok(existsSync(join(repoRoot, skillPath)), `${skillPath} exists`);

  const skill = readRelative(skillPath);
  const frontmatter = parseFrontmatter(skill);

  assert.equal(frontmatter.name, "engineering-principles");
  assert.match(frontmatter.description, /Use when/i);
  assert.match(frontmatter.description, /hexagonal|functional/i);

  for (const expectedTerm of [
    "domain",
    "application",
    "ports",
    "adapters",
    "pure functions",
    "dependency rule",
  ]) {
    assert.match(skill, new RegExp(expectedTerm, "i"));
  }

  const readme = readRelative("README.md");
  assert.match(readme, /engineering-principles/);
  assert.match(readme, /hexagonal architecture/i);
  assert.match(readme, /functional programming/i);
});

test("project scaffolding and review guidance enforce architecture and FP conventions", () => {
  const techStack = readRelative("skills/tech-stack/SKILL.md");
  assert.match(techStack, /engineering-principles/);
  assert.match(techStack, /hexagonal/i);
  assert.match(techStack, /functional core/i);

  const newProject = readRelative("skills/new-project/SKILL.md");
  for (const expectedPath of [
    "src/domain",
    "src/application",
    "src/ports",
    "src/adapters",
    "src/http",
  ]) {
    assert.match(newProject, new RegExp(expectedPath.replace("/", "\\/")));
  }
  assert.match(newProject, /pure use case/i);

  const specTemplate = readRelative("skills/spec-conventions/template.md");
  assert.match(specTemplate, /Architecture boundaries/i);
  assert.match(specTemplate, /Functional core/i);

  const codeReviewer = readRelative("skills/code-reviewer/SKILL.md");
  assert.match(codeReviewer, /dependency rule/i);
  assert.match(codeReviewer, /side effects/i);
  assert.match(codeReviewer, /adapters/i);
});
