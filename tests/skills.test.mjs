import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = new URL("..", import.meta.url).pathname;

function readRelative(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function markdownSection(markdown, heading) {
  const marker = `## ${heading}\n`;
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, `${heading} section exists`);

  const content = markdown.slice(start + marker.length);
  const nextHeading = content.search(/^## /m);
  return nextHeading === -1 ? content : content.slice(0, nextHeading);
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

test("quality companions are documented and remain optional and technology-scoped", () => {
  const readme = readRelative("README.md");
  const techStack = readRelative("skills/tech-stack/SKILL.md");
  const newProject = readRelative("skills/new-project/SKILL.md");
  const readmeCompanions = markdownSection(readme, "Optional companions");
  const techCompanions = markdownSection(techStack, "Companion capabilities");
  const beforeScaffolding = markdownSection(newProject, "Before scaffolding");
  const scaffoldSteps = markdownSection(newProject, "Steps");

  const companions = [
    "vercel-react-best-practices",
    "vercel-composition-patterns",
    "vitest",
    "playwright-best-practices",
  ];

  for (const companion of companions) {
    assert.match(readmeCompanions, new RegExp(companion));
    assert.match(techCompanions, new RegExp(companion));
    assert.match(beforeScaffolding, new RegExp(companion));
  }

  const installCommands = [
    "npx skills add vercel-labs/agent-skills@vercel-react-best-practices",
    "npx skills add vercel-labs/agent-skills@vercel-composition-patterns",
    "npx skills add pproenca/dot-skills@vitest",
    "npx skills add currents-dev/playwright-best-practices-skill@playwright-best-practices",
  ];
  const readmeLines = readmeCompanions.split("\n");
  for (const command of installCommands) {
    assert.ok(readmeLines.includes(command), `${command} is an exact command line`);
  }

  assert.match(readmeCompanions, /not bundled as dependencies/i);
  assert.match(readmeCompanions, /not\s+installed automatically/i);
  assert.match(techCompanions, /technology-specific advisors/i);
  assert.match(techCompanions, /do not replace Superpowers' methodology/i);
  assert.match(techCompanions, /does not make Playwright a stack dependency/i);
  assert.match(beforeScaffolding, /Companions are optional advisors: do not install them/i);

  assert.match(
    beforeScaffolding,
    /`vercel-react-best-practices` for React rendering,[\s\S]*performance guidance\./
  );
  assert.match(
    beforeScaffolding,
    /`vercel-composition-patterns` for reusable React component API design\./
  );
  assert.match(
    beforeScaffolding,
    /`vitest` for Vitest-specific test design,[\s\S]*reliability\./
  );
  assert.match(
    beforeScaffolding,
    /`playwright-best-practices` only if the user selects Playwright[\s\S]*browser E2E tests\./
  );
  assert.match(
    scaffoldSteps,
    /use `vercel-react-best-practices` for React[\s\S]*`vercel-composition-patterns`[\s\S]*reusable component APIs\./
  );
  assert.match(
    scaffoldSteps,
    /Add Playwright browser E2E only when the user requests it[\s\S]*`playwright-best-practices` is available/
  );

  const claudeManifest = JSON.parse(readRelative(".claude-plugin/plugin.json"));
  assert.deepEqual(claudeManifest.dependencies, ["superpowers"]);
});

test("repository ignores transient Superpowers workflow artifacts", () => {
  const gitignorePath = join(repoRoot, ".gitignore");
  assert.ok(existsSync(gitignorePath), ".gitignore exists");

  const ignoredPaths = readFileSync(gitignorePath, "utf8").split("\n");
  assert.ok(ignoredPaths.includes("/.context/"), ".context is ignored at the repository root");
  assert.ok(
    ignoredPaths.includes("/docs/superpowers/"),
    "Superpowers' default workflow artifact directory is ignored"
  );
});

test("spec conventions separate transient workflow artifacts from durable documents", () => {
  const specConventions = readRelative("skills/spec-conventions/SKILL.md");

  assert.match(specConventions, /`.context\/superpowers\/`/);
  assert.match(specConventions, /do not commit[^\n]*`.context\/`/i);
  assert.match(specConventions, /do not commit[^\n]*`docs\/superpowers\/`/i);
  assert.match(specConventions, /trivial changes[^\n]*skip/i);
  assert.match(specConventions, /approved[^\n]*`specs\/NNN-slug\.md`[^\n]*commit/i);
  assert.match(specConventions, /durable[^\n]*`docs\/`[^\n]*commit/i);
});

test("new project scaffolding keeps workflow artifacts transient", () => {
  const newProject = readRelative("skills/new-project/SKILL.md");
  const scaffoldSteps = markdownSection(newProject, "Steps");

  assert.match(scaffoldSteps, /`\/\.context\/`/);
  assert.match(scaffoldSteps, /`\/docs\/superpowers\/`/);
  assert.match(scaffoldSteps, /transient workflow artifacts[^\n]*`.context\/superpowers\/`/i);
  assert.match(scaffoldSteps, /durable specs[^\n]*`specs\/`/i);
  assert.match(scaffoldSteps, /durable project documentation[^\n]*`docs\/`/i);
});
