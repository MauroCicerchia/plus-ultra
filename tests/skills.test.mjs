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

function detailsBlock(markdown, label) {
  const match = markdown.match(
    new RegExp(`<details>\\s*<summary>${label}</summary>[\\s\\S]*?</details>`)
  );
  assert.ok(match, `${label} is contained in a details block`);
  return match[0];
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

test("product-discovery defines the portable, approval-gated product brief contract", () => {
  const skillPath = "skills/product-discovery/SKILL.md";
  const templatePath = "skills/product-discovery/assets/product.md";
  const metadataPath = "skills/product-discovery/agents/openai.yaml";
  assert.ok(existsSync(join(repoRoot, skillPath)), `${skillPath} exists`);
  assert.ok(existsSync(join(repoRoot, templatePath)), `${templatePath} exists`);
  assert.ok(existsSync(join(repoRoot, metadataPath)), `${metadataPath} exists`);

  const skill = readRelative(skillPath);
  const template = readRelative(templatePath);
  const metadata = readRelative(metadataPath);
  const frontmatter = parseFrontmatter(skill);
  const normalized = skill.replace(/\s+/g, " ");

  assert.equal(frontmatter.name, "product-discovery");
  assert.match(frontmatter.description, /^Use when/);
  assert.match(frontmatter.description, /product|discovery|brief/i);
  assert.match(metadata, /display_name:/);
  assert.match(metadata, /short_description:/);
  assert.match(metadata, /default_prompt:/);

  const canonicalSections = [
    "Target user",
    "Core problem",
    "Current alternative",
    "Value proposition",
    "MVP hypothesis",
    "Core user journeys",
    "Non-goals",
    "Success criteria",
    "Product principles and constraints",
  ];
  const templateSections = [...template.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(templateSections, canonicalSections, "template has exactly the canonical sections in order");
  assert.equal((template.match(/^# Product brief$/gm) ?? []).length, 1, "template has one title");

  assert.match(normalized, /initial adaptive discovery/i);
  assert.match(normalized, /focused (?:strategic )?update/i);
  assert.match(normalized, /read-only (?:consumption )?mode/i);
  assert.match(normalized, /only .*?product-discovery.*?(?:may|is authorized to).*(?:create|write|strategic(?:ally)? update).*?`?docs\/product\.md`?/i);
  assert.match(normalized, /conversation.*?(?:repository|context)|repository.*?conversation.*?context/i);
  assert.match(normalized, /material assumptions?.*?(?:visible|label)|(?:visible|label).*?material assumptions?/i);
  assert.match(normalized, /one (?:relevant )?decision at a time/i);
  assert.match(normalized, /two (?:or three|-to-three|to three)|2.?3 alternatives/i);
  assert.match(normalized, /trade-offs?/i);
  assert.match(normalized, /recommendation/i);
  assert.match(normalized, /challenge.*?scope.*?MVP hypothesis|MVP hypothesis.*?challenge.*?scope/i);
  assert.match(
    normalized,
    /(?:complete|full).*?visible proposal.*?(?:before|prior to).*?(?:creating|create|writing|write|updating|update)/i,
    "a complete visible proposal precedes a durable write"
  );
  assert.match(normalized, /explicit human approval.*?(?:before|prior to).*?(?:create|write|update)|(?:create|write|update).*?only after.*?explicit human approval/i);
  assert.match(
    normalized,
    /(?:write.*?only after.*?explicit human approval|do not write.*?until approval).*?(?:declined|unapproved).*?(?:leave|keep).*?unchanged/i,
    "approval gating links a no-write condition to unchanged durable state"
  );
  assert.match(normalized, /focused update.*?only.*?affected decisions/i);
  assert.match(normalized, /preserv.*?unaffected.*?sections/i);
  assert.match(normalized, /rewrite|replacement.*?current.state/i);
  assert.match(normalized, /not.*?(?:append|journal|history)|(?:append|journal|history).*?not/i);
  assert.match(normalized, /without.*?brief.*?read-only|read-only.*?without.*?brief/i);
  assert.match(normalized, /must not create.*?implicitly|never.*?create.*?implicitly/i);
  assert.doesNotMatch(skill, /CLAUDE_PLUGIN_ROOT|PLUGIN_ROOT|hooks\/|commands\//i, "skill stays portable");
});

test("product-brief consumers preserve read-only ownership and pause for approved rediscovery", () => {
  const consumers = [
    { name: "new-project", path: "skills/new-project/SKILL.md" },
    { name: "roadmap-planning", path: "skills/roadmap-planning/SKILL.md" },
    { name: "refine-issues", path: "skills/refine-issues/SKILL.md" },
    { name: "spec", path: "skills/spec/SKILL.md" },
    { name: "spec-conventions", path: "skills/spec-conventions/SKILL.md" },
  ];

  for (const consumer of consumers) {
    const skill = readRelative(consumer.path);
    const normalized = skill.replace(/\s+/g, " ");

    assert.match(normalized, /(?:read|consume).*?`?docs\/product\.md`?.*(?:brief|context)|(?:brief|context).*?(?:read|consume).*?`?docs\/product\.md`?/i, `${consumer.name} reads a present brief`);
    assert.match(normalized, /(?:missing|without|absent).*?(?:brief|docs\/product\.md).*?(?:continue|compatible|normal)|(?:continue|compatible|normal).*?(?:missing|without|absent).*?(?:brief|docs\/product\.md)/i, `${consumer.name} remains compatible when the brief is absent`);
    assert.match(normalized, /(?:must not|never|do not).*?(?:create|edit|write|mutate).*?`?docs\/product\.md`?/i, `${consumer.name} never takes ownership of the brief`);
    assert.match(normalized, /durable contradiction.*?pause.*?\$product-discovery.*?focused.*?(?:update|rediscovery).*?explicit human approval.*?resume/i, `${consumer.name} pauses for approved focused rediscovery`);
  }

  const newProject = readRelative("skills/new-project/SKILL.md").replace(/\s+/g, " ");
  assert.match(newProject, /greenfield.*?missing.*?docs\/product\.md.*?\$product-discovery.*?initial adaptive discovery.*?explicit human approval.*?(?:before|prior to).*?stack selection/i, "greenfield scaffolding discovers an approved brief before choosing a stack");
  assert.match(newProject, /existing repositor(?:y|ies).*?(?:must not|never|do not).*?(?:create|edit|write).*?docs\/product\.md/i, "existing repositories do not implicitly gain a brief");

  const spec = readRelative("skills/spec/SKILL.md").replace(/\s+/g, " ");
  assert.match(spec, /new.*?(?:read|consume).*?docs\/product\.md/i, "new technical contracts consume a present brief");
  assert.match(spec, /(?:list|link|status).*?(?:continue|do not block|compatible).*?(?:without|missing|absent).*?(?:brief|docs\/product\.md)/i, "administrative spec operations remain available without a brief");
});

test("README documents the durable product-discovery workflow", () => {
  const readme = readRelative("README.md").replace(/\s+/g, " ");

  assert.match(readme, /greenfield.*?(?:before|prior to).*?(?:stack selection|scaffolding).*?\$?product-discovery/i);
  assert.match(readme, /only.*?product-discovery.*?(?:create|write|strategic(?:ally)? update).*?docs\/product\.md/i);
  assert.match(readme, /existing repositor(?:y|ies).*?(?:without|missing).*?(?:brief|docs\/product\.md).*?(?:continue|compatible)/i);
  assert.match(readme, /read-only.*?(?:roadmap|refin(?:e|ement)|spec|design|feature)/i);
  assert.match(readme, /durable contradiction.*?focused.*?(?:rediscovery|update).*?explicit human approval/i);
  assert.doesNotMatch(readme, /product.discovery[\s\S]{0,100}(?:hook|script|dependency|command)/i, "product-discovery documentation stays portable");
});

test("workflow-risk is a portable, issue-linked FAST/STANDARD/CRITICAL contract", () => {
  const skillPath = "skills/workflow-risk/SKILL.md";
  assert.ok(existsSync(join(repoRoot, skillPath)), `${skillPath} exists`);

  const skill = readRelative(skillPath);
  const spec = readRelative("specs/009-classify-workflow-risk.md");
  const readme = readRelative("README.md");
  const frontmatter = parseFrontmatter(skill);
  const normalized = skill.replace(/\s+/g, " ");
  const precedence = markdownSection(skill, "Classification precedence").replace(/\s+/g, " ");
  const standardOutput = markdownSection(skill, "Standard output").replace(/\s+/g, " ");
  const baselineRigor = markdownSection(skill, "Baseline rigor").replace(/\s+/g, " ");
  const scenarios = markdownSection(skill, "Worked classification scenarios").replace(/\s+/g, " ");

  assert.equal(frontmatter.name, "workflow-risk");
  assert.match(frontmatter.description, /^Use when/);
  assert.match(readme, /workflow-risk/);
  assert.match(spec, /^title: Classify workflow risk$/m);
  assert.match(spec, /^status: approved$/m);
  assert.match(spec, /^issue: 23$/m);
  assert.match(spec, /^created: 2026-09-07$/m);

  assert.match(skill, /WorkflowLevel\s*=\s*FAST\s*\|\s*STANDARD\s*\|\s*CRITICAL/);
  assert.match(skill, /Phase\s*=\s*initial\s*\|\s*pre-ship/);
  const dimensions = [
    "authentication",
    "authorization",
    "security-boundary",
    "payments",
    "database-migration",
    "destructive-data",
    "concurrency",
    "persistence-integrity",
    "critical-infrastructure",
  ];
  const dimensionDefinition = skill.match(/RiskDimension\s*=\s*([\s\S]*?)\n```/);
  assert.ok(dimensionDefinition, "RiskDimension is defined in a code block");
  assert.deepEqual(
    dimensionDefinition[1].match(/[a-z]+(?:-[a-z]+)*/g),
    dimensions,
    "RiskDimension has the exact nine-dimension vocabulary"
  );

  for (const field of [
    "phase",
    "prior level",
    "suggested level",
    "effective level",
    "detected/new dimensions",
    "evidence",
    "required verification",
    "explicit override",
  ]) {
    assert.match(normalized, new RegExp(field, "i"), `output contains ${field}`);
  }
  for (const [rule, outcome] of [
    ["1", "known critical trigger.*?CRITICAL"],
    ["2", "FAST.*?every restriction"],
    ["3", "uncertainty.*?without critical evidence.*?STANDARD"],
    ["4", "pre-ship.*?max.*?prior.*?current.*?dimensions.*?accumulate"],
    ["5", "only.*?explicit override.*?(?:lower|remove).*?visible.*?baseline guardrails"],
    ["6", "missing prior.*?must not.*?downgrade"],
  ]) {
    assert.match(precedence, new RegExp(`${rule}\\. .*?${outcome}`, "i"), `precedence rule ${rule}`);
  }
  assert.ok(
    precedence.indexOf("1.") < precedence.indexOf("2.") &&
      precedence.indexOf("2.") < precedence.indexOf("3.") &&
      precedence.indexOf("3.") < precedence.indexOf("4.") &&
      precedence.indexOf("4.") < precedence.indexOf("5.") &&
      precedence.indexOf("5.") < precedence.indexOf("6."),
    "precedence rules retain their ordered outcomes"
  );
  assert.match(standardOutput, /pre-ship.*?maximum of prior and current classification.*?dimensions accumulate/i);
  assert.match(standardOutput, /only an explicit override.*?(?:lower|remove).*?override visible.*?baseline guardrails/i);
  assert.match(baselineRigor, /CRITICAL.*?de-duplicated union.*?every detected\/new dimension/i);

  assert.match(normalized, /FAST.*?small.*?localized.*?focused verification.*?commit guardrails.*?optional review.*?no required durable artifact/i);
  assert.match(normalized, /STANDARD.*?Issue.*?design.*?spec.*?plan.*?TDD.*?relevant suite.*?review.*?PR/i);
  assert.match(normalized, /CRITICAL.*?all STANDARD.*?approved spec.*?mandatory review.*?de-duplicated union/i);

  for (const [dimension, checks] of [
    ["authentication", ["permitted", "denied", "sessions", "roles", "tenancy", "integration", "security review"]],
    ["authorization", ["permitted", "denied", "sessions", "roles", "tenancy", "integration", "security review"]],
    ["security-boundary", ["abuse", "trust-boundary", "Semgrep when available"]],
    ["payments", ["idempotency", "retries", "duplicates", "amounts", "currencies", "rounding", "reconciliation"]],
    ["database-migration", ["representative fixtures", "compatibility", "roll-forward", "rollback", "data safety"]],
    ["destructive-data", ["authorization", "confirmation", "scope", "recovery", "partial failures"]],
    ["concurrency", ["races", "ordering", "retries", "concurrent integration"]],
    ["persistence-integrity", ["atomicity", "invariants", "restarts", "idempotency", "partial failures"]],
    ["critical-infrastructure", ["configuration", "permissions", "integration", "degradation", "recovery", "rollback"]],
  ]) {
    const section = markdownSubsection(skill, dimension).replace(/\s+/g, " ");
    for (const check of checks) assert.match(section, new RegExp(check, "i"), `${dimension}: ${check}`);
  }

  const typeOnlyText = "WorkflowLevel = FAST | STANDARD | CRITICAL";
  assert.doesNotMatch(typeOnlyText, /\*\*FAST→STANDARD:\*\*/, "type-only text is not a transition scenario");
  function workedScenario(label) {
    const marker = `**${label}:**`;
    const start = scenarios.indexOf(marker);
    assert.notEqual(start, -1, `${label} exists in worked scenarios`);
    const end = scenarios.indexOf(" - **", start + marker.length);
    return scenarios.slice(start + marker.length, end === -1 ? undefined : end);
  }
  function assertRetainedPriorScenario(text) {
    assert.match(text, /smaller pre-ship diff/i);
    assert.match(text, /CRITICAL prior level/i);
    assert.match(text, /remains CRITICAL/i);
    assert.match(text, /prior dimensions/i);
  }

  assert.match(
    workedScenario("FAST-localized change"),
    /small.*?localized.*?no critical (?:trigger|new risk).*?(?:is|results) FAST/i,
    "localized FAST scenario proves eligibility and outcome"
  );
  assert.match(
    workedScenario("Ambiguous STANDARD"),
    /incompletely understood.*?(?:is|results) STANDARD/i,
    "ambiguous scenario selects STANDARD"
  );
  assert.match(
    workedScenario("One CRITICAL dimension"),
    /tenancy authorization.*?CRITICAL.*?authorization controls/i,
    "one critical dimension selects CRITICAL with its controls"
  );
  assert.match(
    workedScenario("Multiple CRITICAL dimensions"),
    /payment migration.*?CRITICAL.*?de-duplicated union.*?payments.*?database-migration controls/i,
    "multiple critical dimensions retain both dimensions and union controls"
  );
  assert.match(
    workedScenario("FAST→STANDARD"),
    /previously localized.*?expands.*?becomes STANDARD at pre-ship/i,
    "FAST→STANDARD names its source condition and outcome in the worked scenarios"
  );
  assert.match(
    workedScenario("STANDARD→CRITICAL"),
    /standard change.*?security-boundary trigger.*?becomes CRITICAL at pre-ship/i,
    "STANDARD→CRITICAL names its source condition and outcome in the worked scenarios"
  );
  assertRetainedPriorScenario(workedScenario("Smaller diff retaining prior level"));
  assert.throws(
    () => assertRetainedPriorScenario("A smaller pre-ship diff after a CRITICAL prior level remains FAST."),
    /remains CRITICAL|prior dimensions/,
    "retained-prior validator rejects a FAST downgrade without prior dimensions"
  );
  assert.match(
    workedScenario("Explicit override"),
    /lowers a level or removes dimensions.*?visible.*?baseline guardrails/i,
    "explicit override remains visible and preserves baseline guardrails"
  );
  assert.match(
    workedScenario("Missing prior classification"),
    /pre-ship.*?no known critical (?:evidence|trigger).*?remains STANDARD.*?(?:no|does not infer a) silent downgrade.*?known critical trigger.*?remains CRITICAL/i,
    "missing prior classification remains STANDARD only without critical evidence and preserves CRITICAL precedence"
  );
  assert.match(normalized, /significant UI impact.*?prevents.*?FAST.*?never.*?critical dimension/i);
  assert.match(normalized, /#35.*?UI classification/i);
  assert.match(normalized, /#22.*?(?:orchestration|persistence)/i);
  assert.match(normalized, /#26.*?Semgrep.*?when available/i);
  assert.match(normalized, /no commands.*?hooks.*?state/i);
  assert.match(readme, /#22[\s\S]*?#26[\s\S]*?#35/);
  assert.doesNotMatch(readme, /workflow-risk[^\n]*(?:command|hook|state)/i);
});

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
    "Traceability",
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
    "Traceability",
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

test("pull-request-descriptions preserve Issue-Spec traceability without closing partial stories", () => {
  const skill = readRelative("skills/pull-request-descriptions/SKILL.md");
  const readme = readRelative("README.md");
  const normalized = skill.replace(/\s+/g, " ");

  assert.match(skill, /Issue: #<number>/);
  assert.match(skill, /Spec: `specs\/<path>`/);
  assert.match(skill, /Refs #<number>/);
  assert.match(skill, /Closes #<number>/);
  assert.match(normalized, /exactly one of `Refs #<number>` or `Closes #<number>`.*?each Issue independently/i);
  assert.match(normalized, /`type:story`/i);
  assert.match(normalized, /approved.*?spec.*?linked/i);
  assert.match(normalized, /scope.*?acceptance criteria.*?complete/i);
  assert.match(normalized, /`ready`.*?no blockers/i);
  assert.match(normalized, /no required work.*?deferred/i);
  assert.match(normalized, /state.*?against.*?base/i);
  assert.match(normalized, /ambigu(?:ity|ous).*?`Refs #<number>`.*?never.*?`Closes #<number>`/i);
  assert.match(readme, /Refs #N.*?Closes #N|Closes #N.*?Refs #N/i);
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
  assert.match(skill, /no PR argument/i);
  assert.match(skill, /positive decimal integer/i);
  assert.match(skill, /gh auth status/i);
  assert.match(skill, /gh pr view/i);
  assert.match(skill, /gh pr diff/i);
  assert.match(skill, /headRefOid/i);
  assert.match(skill, /remote PR head/i);
  assert.match(skill, /spec.*GitHub API|GitHub API.*spec/i);
  assert.match(skill, /approved spec/i);
  assert.match(skill, /closingIssuesReferences/);
  assert.match(skill, /gh pr view <pr-number> --json closingIssuesReferences/);
  assert.match(skill, /exactly one approved spec matches[\s\S]*?closing\s+Issues/i);
  assert.match(skill, /Do not parse.*?closing keyword/i);
  assert.match(skill, /Do not use GraphQL.*?discover\s+closing Issues/i);
  assert.match(skill, /explicit.*?selector.*?fallback/i);
  const normalizedReview = skill.replace(/\s+/g, " ");
  assert.match(normalizedReview, /before writes if.*ambiguous|ambiguous.*before writes/i);
  assert.match(normalizedReview, /If zero or several match.*?continue/i);
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

  assert.match(command, /argument-hint: "\[pr-number\] \[--spec <NNN\|slug>\]"/);
  assert.match(command, /positive integer/i);
  assert.match(command, /plus-ultra:pr-reviewer/);
  assert.match(agent, /^name: pr-reviewer$/m);
  assert.match(agent, /^tools: .*Bash/m);
  assert.match(agent, /plus-ultra:pr-review/);
  assert.match(agent, /canonical.*?closing Issue/i);
  assert.match(agent, /Do not parse.*?closing keyword/i);
  assert.match(agent, /headRefOid/);

  assert.match(readme, /plus-ultra:pr-review/);
  assert.match(readme, /\/plus-ultra:pr-review \[pr-number\]/);
  assert.match(readme, /GitHub.*write|write.*GitHub/i);
  assert.match(readme, /pr-reviewer/);

  assert.doesNotMatch(codeReviewer, /\bgh\b/i);
  assert.match(codeReviewer, /Do not modify files/i);
});

test("pr-review resolves an approved contract deterministically and can publish a limited review", () => {
  const skill = readRelative("skills/pr-review/SKILL.md");
  const command = readRelative("commands/pr-review.md");
  const agent = readRelative("agents/pr-reviewer.md");
  const readme = readRelative("README.md");
  const spec = readRelative("specs/003-gracefully-resolve-ambiguous-pr-to-spec-association.md");
  const commandFrontmatter = parseFrontmatter(command);
  const normalizedSkill = skill.replace(/\s+/g, " ");

  assert.equal(commandFrontmatter["argument-hint"], "[pr-number] [--spec <NNN|slug>]");
  for (const invocation of [
    "pr-review",
    "pr-review <PR>",
    "pr-review --spec <NNN|slug>",
    "pr-review <PR> --spec <NNN|slug>",
  ]) {
    assert.match(command, new RegExp(invocation.replace(/[|<>]/g, "\\$&")));
  }
  assert.match(normalizedSkill, /only.*?pr-review.*?pr-review <PR>.*?pr-review --spec <NNN\|slug>.*?pr-review <PR> --spec <NNN\|slug>/i);
  assert.match(normalizedSkill, /reject.*?unknown flag/i);
  assert.match(normalizedSkill, /duplicate.*?--spec/i);
  assert.match(normalizedSkill, /zero.*?negative.*?non-integer/i);
  assert.match(normalizedSkill, /before any network write/i);

  const canonicalIndex = normalizedSkill.indexOf("Canonical closing-Issue match");
  const explicitIndex = normalizedSkill.indexOf("Explicit selector");
  const branchIndex = normalizedSkill.indexOf("Branch association");
  const discoveryIndex = normalizedSkill.indexOf("Approved-spec discovery");
  assert.ok(canonicalIndex < explicitIndex && explicitIndex < branchIndex && branchIndex < discoveryIndex);
  assert.match(normalizedSkill, /canonical.*?exactly one.*?select.*?without consulting.*?--spec/i);
  assert.match(normalizedSkill, /explicit.*?fallback.*?never.*?override.*?canonical/i);
  assert.match(normalizedSkill, /headRefOid.*?source of truth|source of truth.*?headRefOid/i);
  assert.match(normalizedSkill, /not.*?local checkout|local checkout.*?not/i);
  assert.match(normalizedSkill, /gh pr diff.*?headRefOid.*?same remote-head snapshot/i);
  assert.match(normalizedSkill, /issue-<N>.*?hyphen.*?component/i);
  assert.match(normalizedSkill, /NNN-slug.*?exact.*?component.*?\//i);
  assert.match(normalizedSkill, /union.*?deduplicat.*?direct.*?indirect/i);
  assert.match(normalizedSkill, /one candidate.*?continue.*?multiple.*?selection.*?none.*?discovery/i);
  assert.match(normalizedSkill, /path.*?Issue #<N>.*?sin Issue.*?before.*?writ/i);
  assert.match(normalizedSkill, /approved.*?unlinked.*?legacy/i);
  assert.match(normalizedSkill, /exclude.*?draft.*?superseded/i);
  assert.match(normalizedSkill, /selector.*?nonexistent.*?ambiguous.*?draft.*?superseded.*?fail-closed/i);
  assert.match(normalizedSkill, /selector.*?stop without any GitHub write/i);
  assert.match(normalizedSkill, /selector.*?non-approved.*?missing.*?malformed.*?unknown.*?stop.*?without.*?write/i);

  assert.match(normalizedSkill, /no approved spec.*?review without (?:a )?contract.*?explicit acceptance/i);
  assert.match(normalizedSkill, /correctness.*?regressions.*?tests.*?engineering[- ]principles/i);
  assert.match(normalizedSkill, /Spec: none/);
  assert.match(normalizedSkill, /limited review; no contractual verdict/i);
  assert.match(normalizedSkill, /do not.*?acceptance criteria.*?do not.*?ready/i);
  assert.match(normalizedSkill, /only.*?resolve.*?evidence.*?does not depend.*?contract/i);

  assert.match(spec, /^status: approved$/m);
  assert.match(spec, /^issue: 17$/m);
  assert.match(spec, /closingIssuesReferences/);
  assert.match(spec, /headRefOid/);
  assert.match(agent, /headRefOid/);
  assert.match(agent, /limited review|without contract/i);
  assert.match(readme, /--spec <NNN\|slug>/);
  assert.match(readme, /fallback/i);
  for (const path of ["skills/pr-review/SKILL.md", "agents/pr-reviewer.md", "README.md"]) {
    assert.doesNotMatch(readRelative(path), /delegate.*?#17|#17.*?delegate/i, `${path} has no pending #17 delegation`);
  }
});

test("pr-review defines verdict semantics in its publish-and-update summary guidance", () => {
  const contract = markdownSection(
    readRelative("skills/pr-review/SKILL.md"),
    "Publish and update the summary"
  );
  const statusStart = contract.indexOf("## Status");
  const findingsStart = contract.indexOf("## Findings");

  assert.notEqual(statusStart, -1, "Status is in the publish-and-update summary guidance");
  assert.notEqual(findingsStart, -1, "Findings follows Status in the publish-and-update summary guidance");
  const status = contract.slice(statusStart, findingsStart);

  assert.match(status, /✅ Ready — no findings or non-blocking findings\./);
  assert.match(status, /⛔ Changes required — one or more blockers\./);
  assert.match(status, /⚠️ Limited review/);
  assert.match(status, /Spec: none/);
  assert.match(status, /limited review; no contractual verdict/);
});

test("pr-review makes its publish-and-update summary guidance complete and bounded", () => {
  const contract = markdownSection(
    readRelative("skills/pr-review/SKILL.md"),
    "Publish and update the summary"
  );
  const marker = "<!-- plus-ultra:pr-review:summary -->";
  const markerIndex = contract.indexOf(marker);
  const titleIndex = contract.indexOf("# Plus Ultra PR Review");
  const statusIndex = contract.indexOf("## Status");
  const findingsIndex = contract.indexOf("## Findings");
  const traceabilityIndex = contract.indexOf("| Issue | Spec | Contract |");
  const resolutionsHeading = contract.match(/^\s*## .*resolv.*$/im);
  const resolutionsIndex = resolutionsHeading ? contract.indexOf(resolutionsHeading[0]) : -1;
  const evidenceIndex = contract.indexOf("<summary>Evidence</summary>");
  const metadataIndex = contract.indexOf("<summary>Metadata</summary>");
  const findings = contract.slice(findingsIndex, traceabilityIndex);
  const evidence = detailsBlock(contract, "Evidence");
  const metadata = detailsBlock(contract, "Metadata");

  assert.equal(contract.split(marker).length - 1, 1, "the contract has one summary marker");
  assert.match(contract, /^# Plus Ultra PR Review$/m);
  assert.doesNotMatch(contract, /^# .*Plus Ultra PR Review.*[✅⛔⚠️]/m);
  for (const [name, index] of [
    ["summary marker", markerIndex],
    ["title", titleIndex],
    ["status", statusIndex],
    ["findings", findingsIndex],
    ["traceability table", traceabilityIndex],
    ["evidence", evidenceIndex],
    ["metadata", metadataIndex],
  ]) {
    assert.notEqual(index, -1, `${name} is present in publish-and-update summary guidance`);
  }
  assert.ok(
    markerIndex < titleIndex &&
      titleIndex < statusIndex &&
      statusIndex < findingsIndex &&
      findingsIndex < traceabilityIndex &&
      traceabilityIndex < evidenceIndex &&
      evidenceIndex < metadataIndex,
    "publish-and-update summary guidance keeps its required order"
  );

  if (resolutionsIndex !== -1) {
    assert.ok(
      traceabilityIndex < resolutionsIndex && resolutionsIndex < evidenceIndex,
      "the optional resolutions section follows traceability and precedes evidence"
    );
  }

  assert.match(
    findings,
    /(?:<Severity>|severity)[\s\S]*?summary-only[\s\S]*?unanchorable/i,
    "the visible Findings portion identifies unanchorable findings as summary-only"
  );
  assert.match(
    contract.replace(/\s+/g, " "),
    /(?:resolutions?.{0,120}(?:only if|only when|when).{0,120}(?:exist|non[- ]?empty|one or more)|(?:include|omit).{0,120}resolutions?.{0,120}(?:only if|only when|when).{0,120}(?:exist|non[- ]?empty|one or more))/i,
    "resolutions are conditional on resolutions existing"
  );
  for (const field of ["IDs", "SHAs", "duplicate thread references", "counts"]) {
    const declaration = metadata
      .split("\n")
      .find((line) => new RegExp(field, "i").test(line));
    assert.ok(declaration, `${field} has a declaration in Metadata`);
    assert.match(
      declaration,
      /metadata/i,
      `${field} is identified as metadata-only`
    );
    assert.match(
      declaration,
      /(?:omit|exclude|leave out|include)[\s\S]*(?:empty|non[- ]?empty)|(?:if|when)[\s\S]*(?:empty|non[- ]?empty)/i,
      `${field} is included only when nonempty`
    );
  }
  assert.match(evidence, /<details>[\s\S]*<summary>Evidence<\/summary>[\s\S]*<\/details>/);
  assert.match(metadata, /<details>[\s\S]*<summary>Metadata<\/summary>[\s\S]*<\/details>/);
});

test("pr-review distinguishes legacy approved-contract and limited-review traceability", () => {
  const contract = markdownSection(
    readRelative("skills/pr-review/SKILL.md"),
    "Publish and update the summary"
  );
  const traceabilityStart = contract.indexOf("| Issue | Spec | Contract |");
  const resolutionsHeading = contract.match(/^\s*## .*resolv.*$/im);
  const resolutionsStart = resolutionsHeading ? contract.indexOf(resolutionsHeading[0]) : -1;
  const evidenceStart = contract.indexOf("<summary>Evidence</summary>");
  const traceabilityEnd = resolutionsStart === -1 ? evidenceStart : resolutionsStart;
  const traceability = contract.slice(traceabilityStart, traceabilityEnd);

  assert.notEqual(traceabilityStart, -1, "the compact traceability table exists");
  assert.match(
    traceability,
    /\| none \| `specs\/<path>` \(approved\) \| Contractual review \|/,
    "an approved legacy contract without issue: has a distinct traceability row"
  );
  assert.match(
    traceability,
    /\| none \| none \| Limited review \|/,
    "a limited review remains distinguishable from a legacy contractual review"
  );
});

test("pr-review omits empty severity headings from visible findings", () => {
  const contract = markdownSection(
    readRelative("skills/pr-review/SKILL.md"),
    "Publish and update the summary"
  );
  const findingsStart = contract.indexOf("## Findings");
  const traceabilityStart = contract.indexOf("| Issue | Spec | Contract |");
  const findings = contract.slice(findingsStart, traceabilityStart);
  const normalizedFindings = findings.replace(/\s+/g, " ");

  assert.match(
    normalizedFindings,
    /group visible findings only beneath the severity headings that are present/i,
    "findings are grouped only under severities that are present"
  );
  assert.match(
    normalizedFindings,
    /omit every empty severity heading/i,
    "empty severity headings are omitted"
  );
  assert.doesNotMatch(
    findings,
    /###\s+Unanchorable/i,
    "unanchorable findings do not get a separate visible severity"
  );
});

test("pr-review keeps prior resolutions human-readable and thread IDs metadata-only", () => {
  const contract = markdownSection(
    readRelative("skills/pr-review/SKILL.md"),
    "Publish and update the summary"
  );
  const resolutionsStart = contract.search(/^\s*## .*resol.*$/im);
  const evidenceStart = contract.indexOf("<summary>Evidence</summary>");
  const metadata = detailsBlock(contract, "Metadata");
  const resolutions = contract.slice(resolutionsStart, evidenceStart);
  const normalizedResolutions = resolutions.replace(/\s+/g, " ");

  assert.notEqual(resolutionsStart, -1, "the optional resolutions guidance exists");
  assert.match(
    normalizedResolutions,
    /Describe each resolution human-first \(the behavior that is now fixed and the evidence\), not as an internal identifier/i,
    "prior resolutions lead with behavior and evidence"
  );
  assert.match(
    normalizedResolutions,
    /Keep thread IDs in Metadata only/i,
    "thread IDs are excluded from visible resolution descriptions"
  );
  assert.ok(
    normalizedResolutions.indexOf("human-first") < normalizedResolutions.indexOf("thread IDs"),
    "human-readable resolution guidance precedes ID handling"
  );
  assert.match(metadata, /IDs are metadata-only/i, "IDs remain metadata-only");
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

test("human integration boundary is a durable, portable policy", () => {
  const specPath = "specs/007-require-human-approval-before-integration.md";
  const skillPath = "skills/integration-boundary/SKILL.md";

  assert.ok(existsSync(join(repoRoot, specPath)), `${specPath} exists`);
  assert.ok(existsSync(join(repoRoot, skillPath)), `${skillPath} exists`);

  const spec = readRelative(specPath);
  const skill = readRelative(skillPath);
  const frontmatter = parseFrontmatter(skill);
  const normalizedSkill = skill.replace(/\s+/g, " ");

  assert.match(spec, /^title: Require human approval before integration$/m);
  assert.match(spec, /^status: approved$/m);
  assert.match(spec, /^issue: 52$/m);
  assert.match(spec, /^created: 2026-09-06$/m);
  assert.match(spec, /^# 007 — Require human approval before integration$/m);
  const acceptanceCriteria = spec.match(/^- \[[ x]\]/gm) ?? [];
  const checkedCriteria = spec.match(/^- \[x\]/gm) ?? [];
  assert.equal(acceptanceCriteria.length, 11, "Issue 52 has 11 acceptance criteria");
  assert.equal(checkedCriteria.length, 11, "all Issue 52 acceptance criteria are checked after verification");

  assert.equal(frontmatter.name, "integration-boundary");
  assert.match(frontmatter.description, /Use when/i);
  assert.match(frontmatter.description, /finish|merge|release|tag|protected push/i);
  assert.match(normalizedSkill, /plans?.*?specs?.*?issues?.*?earlier messages?.*?never.*?authori[sz].*?integration/i);
  assert.match(normalizedSkill, /ready for (?:integration|review).*?stop/i);
  assert.match(normalizedSkill, /commit.*?feature branch.*?pull request.*?stack/i);
  assert.match(normalizedSkill, /must not.*?merge.*?auto-merge.*?default branch.*?release.*?tag/i);
  assert.match(normalizedSkill, /no `plus-ultra:integrate` command/i);
});

test("integration guidance separates manual rollout from executable work across platforms", () => {
  const conventions = readRelative("skills/spec-conventions/SKILL.md");
  const readme = readRelative("README.md");
  const agents = readRelative("AGENTS.md");
  const normalizedConventions = conventions.replace(/\s+/g, " ");
  const normalizedReadme = readme.replace(/\s+/g, " ");
  const normalizedAgents = agents.replace(/\s+/g, " ");

  const postApproval = markdownSection(conventions, "Post-approval integration");
  assert.match(postApproval, /manual.*?integration/i);
  assert.match(postApproval, /must not.*?execut(?:e|ed).*?implementation agent/i);
  assert.match(normalizedConventions, /outside.*?executable checklist/i);

  for (const document of [normalizedReadme, normalizedAgents]) {
    assert.match(document, /plans?.*?specs?.*?issues?.*?never.*?authori[sz].*?(?:merge|publish)/i);
    assert.match(document, /ready for (?:integration|review).*?stop/i);
    assert.match(document, /feature branch.*?pull request.*?stack/i);
    assert.match(document, /merge.*?auto-merge.*?default branch.*?(?:release|tag)/i);
  }

  assert.match(normalizedReadme, /Claude.*?Codex.*?hook.*?guardrail/i);
  assert.match(normalizedReadme, /Cursor.*?(?:portable skill|documentation-only)/i);
  assert.match(normalizedAgents, /Claude.*?Codex.*?lifecycle hooks/i);
  assert.match(normalizedAgents, /Cursor.*?(?:portable skill|documentation-only)/i);
});
