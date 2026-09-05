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

function markdownSubsection(markdown, heading) {
  const marker = `### ${heading}\n`;
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, `${heading} subsection exists`);

  const content = markdown.slice(start + marker.length);
  const nextHeading = content.search(/^### /m);
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

test("spec lifecycle links optional GitHub Issues without owning work state", () => {
  const template = readRelative("skills/spec-conventions/template.md");
  const conventions = readRelative("skills/spec-conventions/SKILL.md");
  const spec = readRelative("skills/spec/SKILL.md");
  const command = readRelative("commands/spec.md");

  assert.match(template, /status: draft # draft → approved → superseded/);
  assert.match(template, /issue: <positive GitHub Issue number> # optional/);
  assert.match(conventions, /draft → approved → superseded/);
  assert.doesNotMatch(conventions, /status: in-progress|status: done/);
  assert.match(spec, /new --issue <positive-integer>/);
  assert.match(spec, /new <kebab-case-slug> --issue <positive-integer>/);
  assert.match(spec, /link <NNN\|slug> <positive-integer>/);
  assert.match(spec, /gh issue view <number>/);
  assert.match(spec, /type:story.*not.*require|not.*require.*type:story/i);
  assert.match(spec, /explicit confirmation/i);
  assert.match(command, /new \[<slug>\] --issue <positive-integer>/);
  assert.match(command, /link <NNN\|slug> <positive-integer>/);
});

test("Issue-linked spec documentation", () => {
  const refiner = readRelative("skills/refine-issues/SKILL.md");
  const readme = readRelative("README.md");
  const codexManifest = JSON.parse(readRelative(".codex-plugin/plugin.json"));
  const prReviewCommand = parseFrontmatter(readRelative("commands/pr-review.md"));

  assert.match(refiner, /plus-ultra:spec new --issue <number>/);
  assert.match(refiner, /do not create|never create.*spec/i);
  assert.match(readme, /draft → approved → superseded/);
  assert.match(readme, /approved.*Issue #|Issue.*approved/i);
  assert.match(codexManifest.interface.longDescription, /draft -> approved -> superseded/);
  assert.doesNotMatch(JSON.stringify(codexManifest), /draft -> approved -> in-progress -> done/);
  assert.match(codexManifest.interface.defaultPrompt[1], /approved technical contract/i);
  assert.doesNotMatch(JSON.stringify(codexManifest), /in-progress plus-ultra spec|active spec/i);
  assert.match(prReviewCommand.description, /approved technical contract/i);
  assert.doesNotMatch(prReviewCommand.description, /active spec|in-progress/i);
});

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

test("pull-request-descriptions leads with a human-first overview and conditional Mermaid diagrams", () => {
  const skill = readRelative("skills/pull-request-descriptions/SKILL.md");
  const templateStart = skill.indexOf("## Recommended Template");
  const templateEnd = skill.indexOf("## Section Guidance");
  assert.notEqual(templateStart, -1, "Recommended Template section exists");
  assert.notEqual(templateEnd, -1, "Section Guidance section exists");
  const template = skill.slice(templateStart, templateEnd);
  const metadata = readRelative("skills/pull-request-descriptions/agents/openai.yaml");
  const readme = readRelative("README.md");

  const orderedSections = [
    "At a glance",
    "Diagram",
    "Context",
    "Summary",
    "Testing",
    "Risks",
    "Review Guidance",
  ];
  let previousIndex = -1;
  for (const heading of orderedSections) {
    const headingIndex = template.indexOf(`## ${heading}`);
    assert.notEqual(headingIndex, -1, `${heading} is present in the template`);
    assert.ok(headingIndex > previousIndex, `${heading} follows the previous template section`);
    previousIndex = headingIndex;
  }

  const normalized = skill.replace(/\s+/g, " ");
  assert.match(normalized, /At a glance.*?at most three sentences/i);
  assert.match(normalized, /problem.*?observable outcome.*?affected audience/i);
  assert.match(normalized, /exactly one compact Mermaid diagram/i);
  assert.match(normalized, /three or more components, services, or modules/i);
  assert.match(normalized, /request, data, control, or dependency flow/i);
  assert.match(normalized, /lifecycle or state transitions/i);
  assert.match(normalized, /non-obvious before\/after architecture/i);
  assert.match(normalized, /localized fixes.*?straightforward documentation\/configuration\/dependency updates/i);
  assert.match(normalized, /Never invent relationships.*?placeholder Mermaid/i);

  for (const diagram of ["flowchart", "sequenceDiagram", "stateDiagram-v2"]) {
    assert.match(skill, new RegExp(diagram));
  }
  assert.match(normalized, /no more than eight nodes or participants/i);

  for (const expectedSection of [
    "Context",
    "Summary",
    "Testing",
    "Risks",
    "Review Guidance",
  ]) {
    assert.match(template, new RegExp(`## ${expectedSection}`));
  }

  assert.match(readme, /human-first overview/i);
  assert.match(readme, /conditional Mermaid diagrams/i);
  assert.match(metadata, /human-first overview/i);
  assert.match(metadata, /conditional Mermaid diagrams/i);
});

test("pull-request-descriptions demonstrates diagram decisions for common review scenarios", () => {
  const skill = readRelative("skills/pull-request-descriptions/SKILL.md");
  const examples = markdownSection(skill, "Diagram Examples").replace(/\s+/g, " ");

  assert.match(examples, /localized fix.*?omit the Diagram section/i);
  assert.match(examples, /cross-component flow.*?flowchart/i);
  assert.match(examples, /ordered interaction.*?sequenceDiagram/i);
  assert.match(examples, /lifecycle change.*?stateDiagram-v2/i);
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
  const frontmatter = parseFrontmatter(specConventions);
  const normalized = specConventions.replace(/\s+/g, " ");

  assert.match(frontmatter.description, /workflow artifacts/i);
  assert.match(normalized, /`.context\/superpowers\/`/);
  assert.match(normalized, /do not commit.*?`.context\/`/i);
  assert.match(normalized, /do not commit.*?`docs\/superpowers\/`/i);
  assert.match(normalized, /trivial changes.*?skip/i);
  assert.match(normalized, /approved.*?`specs\/NNN-slug\.md`.*?commit/i);
  assert.match(normalized, /durable.*?`docs\/`.*?commit/i);
  assert.match(normalized, /ensure `.gitignore` contains `\/\.context\/` and `\/docs\/superpowers\/`/i);
});

test("new project scaffolding keeps workflow artifacts transient", () => {
  const newProject = readRelative("skills/new-project/SKILL.md");
  const scaffoldSteps = markdownSection(newProject, "Steps");
  const normalized = scaffoldSteps.replace(/\s+/g, " ");

  assert.match(scaffoldSteps, /`\/\.context\/`/);
  assert.match(scaffoldSteps, /`\/docs\/superpowers\/`/);
  assert.match(normalized, /transient workflow artifacts.*?`.context\/superpowers\/`/i);
  assert.match(normalized, /durable specs.*?`specs\/`/i);
  assert.match(normalized, /durable project documentation.*?`docs\/`/i);
  assert.match(normalized, /trivial changes.*?skip/i);
});

test("Quick start activates artifact conventions before Superpowers", () => {
  const readme = readRelative("README.md");
  const quickStart = markdownSection(readme, "Quick start");

  for (const heading of ["Start a new project", "Use an existing repository"]) {
    const path = markdownSubsection(quickStart, heading);
    const conventionsIndex = path.indexOf("plus-ultra:spec-conventions");
    const superpowersIndex = path.indexOf("Superpowers");

    assert.notEqual(conventionsIndex, -1, `${heading} activates spec-conventions`);
    assert.notEqual(superpowersIndex, -1, `${heading} invokes Superpowers`);
    assert.ok(conventionsIndex < superpowersIndex, `${heading} activates conventions first`);
  }
});

test("pr-review workflow is packaged, safe, and available through Claude", () => {
  const skillPath = "skills/pr-review/SKILL.md";
  const commandPath = "commands/pr-review.md";
  const agentPath = "agents/pr-reviewer.md";

  assert.ok(existsSync(join(repoRoot, skillPath)), `${skillPath} exists`);
  assert.ok(existsSync(join(repoRoot, commandPath)), `${commandPath} exists`);
  assert.ok(existsSync(join(repoRoot, agentPath)), `${agentPath} exists`);

  const skill = readRelative(skillPath);
  const command = readRelative(commandPath);
  const agent = readRelative(agentPath);
  const readme = readRelative("README.md");
  const codeReviewer = readRelative("skills/code-reviewer/SKILL.md");
  const frontmatter = parseFrontmatter(skill);

  assert.equal(frontmatter.name, "pr-review");
  assert.match(frontmatter.description, /Use when/i);
  assert.match(frontmatter.description, /pull request|PR|GitHub/i);
  assert.match(skill, /no argument/i);
  assert.match(skill, /positive PR number/i);
  assert.match(skill, /gh auth status/i);
  assert.match(skill, /gh pr view/i);
  assert.match(skill, /gh pr diff/i);
  assert.match(skill, /headRefOid/i);
  assert.match(skill, /remote PR head/i);
  assert.match(skill, /spec.*GitHub API|GitHub API.*spec/i);
  assert.match(skill, /approved spec/i);
  assert.match(skill, /closingIssuesReferences/);
  assert.match(skill, /before writes if.*ambiguous|ambiguous.*before writes/i);
  assert.match(skill, /no approved candidates|zero approved candidates|no approved specs|zero approved specs/i);
  assert.match(skill, /selection fails[\s\S]*stop before\s+(?:any\s+)?GitHub writes|stop before writes.*selection fails/i);
  assert.doesNotMatch(skill, /status: in-progress/);
  assert.match(codeReviewer, /status: approved/);
  assert.match(codeReviewer, /explicitly select|ask.*select/i);
  assert.doesNotMatch(codeReviewer, /status: in-progress/);
  assert.doesNotMatch(codeReviewer, /ready or not ready to mark done/i);
  assert.match(skill, /plus-ultra:pr-review:inline/i);
  assert.match(skill, /plus-ultra:pr-review:summary/i);
  assert.match(skill, /pulls\/\{pull_number\}\/comments/i);
  assert.match(skill, /issues\/comments/i);
  assert.match(skill, /resolveReviewThread/i);
  assert.match(skill, /paginate/i);
  assert.match(skill, /authenticated reviewer/i);
  assert.match(skill, /summary marker.*authenticated reviewer|authenticated reviewer.*summary marker/i);
  assert.match(skill, /equivalent unresolved/i);
  assert.match(skill, /unanchorable/i);
  assert.match(skill, /Report every mutation/i);

  assert.match(command, /argument-hint: "\[pr-number\]"/);
  assert.match(command, /positive integer/i);
  assert.match(command, /plus-ultra:pr-reviewer/);
  assert.match(agent, /^name: pr-reviewer$/m);
  assert.match(agent, /^tools: .*Bash/m);
  assert.match(agent, /plus-ultra:pr-review/);

  assert.match(readme, /plus-ultra:pr-review/);
  assert.match(readme, /\/plus-ultra:pr-review \[pr-number\]/);
  assert.match(readme, /GitHub.*write|write.*GitHub/i);
  assert.match(readme, /pr-reviewer/);

  assert.doesNotMatch(codeReviewer, /\bgh\b/i);
  assert.match(codeReviewer, /Do not modify files/i);
});

test("GitHub Issues workflows are portable, confirmation-gated, and available through Claude", () => {
  const workflows = [
    {
      name: "issue-management",
      command: "issue-management",
      agent: "issue-manager",
      displayName: "Issue Management",
    },
    {
      name: "refine-issues",
      command: "refine-issues",
      agent: "issue-refiner",
      displayName: "Refine Issues",
    },
    {
      name: "roadmap-planning",
      command: "roadmap-planning",
      agent: "roadmap-planner",
      displayName: "Roadmap Planning",
    },
  ];

  const readme = readRelative("README.md");
  for (const workflow of workflows) {
    const skillPath = `skills/${workflow.name}/SKILL.md`;
    const commandPath = `commands/${workflow.command}.md`;
    const agentPath = `agents/${workflow.agent}.md`;
    const metadataPath = `skills/${workflow.name}/agents/openai.yaml`;

    assert.ok(existsSync(join(repoRoot, skillPath)), `${skillPath} exists`);
    assert.ok(existsSync(join(repoRoot, commandPath)), `${commandPath} exists`);
    assert.ok(existsSync(join(repoRoot, agentPath)), `${agentPath} exists`);
    assert.ok(existsSync(join(repoRoot, metadataPath)), `${metadataPath} exists`);

    const skill = readRelative(skillPath);
    const command = readRelative(commandPath);
    const agent = readRelative(agentPath);
    const metadata = readRelative(metadataPath);
    const frontmatter = parseFrontmatter(skill);

    assert.equal(frontmatter.name, workflow.name);
    assert.match(frontmatter.description, /Use when/i);
    assert.match(command, new RegExp(`plus-ultra:${workflow.agent}`));
    assert.match(agent, new RegExp(`^name: ${workflow.agent}$`, "m"));
    assert.match(agent, new RegExp(`plus-ultra:${workflow.name}`));
    assert.match(metadata, new RegExp(`display_name: "${workflow.displayName}"`));
    assert.match(readme, new RegExp(`plus-ultra:${workflow.name}`));
  }

  const management = readRelative("skills/issue-management/SKILL.md");
  assert.match(management, /type:epic/);
  assert.match(management, /type:story/);
  for (const status of ["backlog", "ready", "in-progress", "blocked"]) {
    assert.match(management, new RegExp(`status:${status}`));
  }
  for (const priority of ["high", "medium", "low"]) {
    assert.match(management, new RegExp(`priority:${priority}`));
  }
  assert.match(management, /gh auth status/);
  assert.match(management, /ADMIN/);
  assert.match(management, /explicit confirmation/i);
  assert.match(management, /v2\.94\.0/);
  assert.match(management, /gh issue create --parent/);
  assert.match(management, /gh issue edit <parent> --add-sub-issue <child>/);
  assert.match(management, /gh issue view <issue> --json parent,subIssues,subIssuesSummary/);
  assert.match(management, /capabilit(?:y|ies).*absent|absent.*capabilit(?:y|ies)/i);
  assert.match(management, /GraphQL.*fallback|fallback.*GraphQL/i);
  assert.match(management, /node IDs only.*?fallback/i);
  assert.doesNotMatch(management, /Create issues through the GitHub\s+GraphQL/i);
  assert.match(management, /GitHub Projects/i);
  assert.match(management, /not.*GitHub Projects|GitHub Projects.*not/i);
  assert.match(management, /replace.*status|status.*replace/i);
  assert.match(management, /replace.*priority|priority.*replace/i);
  assert.match(management, /remove.*same group|same group.*remove/i);
  for (const label of ["type:epic", "type:story", "status:backlog", "priority:high"]) {
    assert.match(management, new RegExp(`${label}.*#[0-9A-Fa-f]{6}`));
  }

  const refiner = readRelative("skills/refine-issues/SKILL.md");
  for (const section of [
    "Context",
    "Goal",
    "Scope",
    "Acceptance Criteria",
    "Dependencies",
    "Risks",
  ]) {
    assert.match(refiner, new RegExp(section));
  }
  assert.match(refiner, /issue number/i);
  assert.match(refiner, /explicit confirmation/i);
  assert.match(refiner, /do not.*edit|never.*edit/i);

  const roadmap = readRelative("skills/roadmap-planning/SKILL.md");
  const normalizedRoadmap = roadmap.replace(/\s+/g, " ");
  assert.match(roadmap, /brief.*issue|issue.*brief/i);
  assert.match(roadmap, /Milestone/);
  assert.match(roadmap, /Epic/);
  assert.match(roadmap, /Story/);
  assert.match(roadmap, /dependencies/i);
  assert.match(roadmap, /explicit confirmation/i);
  assert.match(normalizedRoadmap, /do not invent.*dates.*assignees.*estimates.*priorities/i);
  assert.match(roadmap, /v2\.94\.0/);
  assert.match(roadmap, /gh issue create --parent/);
  assert.match(roadmap, /gh issue edit <parent> --add-sub-issue <child>/);
  assert.match(roadmap, /capabilit(?:y|ies).*absent|absent.*capabilit(?:y|ies)/i);
  assert.match(normalizedRoadmap, /GraphQL.*fallback|fallback.*GraphQL/i);

  const issueWorkflows = markdownSection(readme, "GitHub Issue workflows");
  assert.match(issueWorkflows, /v2\.94\.0/);
  assert.match(issueWorkflows, /native.*hierarch|hierarch.*native/i);
  assert.match(issueWorkflows, /GraphQL.*fallback|fallback.*GraphQL/i);
});
