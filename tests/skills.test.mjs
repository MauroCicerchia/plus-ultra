import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function listDir(path) {
  try {
    return readdirSync(join(repoRoot, path), { withFileTypes: true });
  } catch {
    return [];
  }
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, "file must start with YAML frontmatter");
  const name = match[1].match(/^name:\s*(.+)$/m);
  const description = match[1].match(/^description:\s*(.+)$/m);
  return { name: name?.[1].trim(), description: description?.[1].trim() };
}

// The five user-facing capabilities, in workflow order.
const CAPABILITIES = ["new-project", "product", "roadmap", "refine-issue", "implement-issue"];
// Shared policy and helper skills the capabilities lean on.
const SUPPORTING = ["code-review", "conventions", "integration-boundary"];
const SKILLS = [...CAPABILITIES, ...SUPPORTING];

test("the plugin ships exactly the reboot skill set", () => {
  const present = listDir("skills")
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(present, [...SKILLS].sort());
});

test("every skill declares frontmatter whose name matches its directory", () => {
  for (const skill of SKILLS) {
    const { name, description } = frontmatter(read(`skills/${skill}/SKILL.md`));
    assert.equal(name, skill, `skills/${skill}/SKILL.md name must match its directory`);
    assert.ok(description && description.length > 20, `skills/${skill} needs a usable description`);
  }
});

test("each capability is reachable from Claude commands and Codex interfaces", () => {
  for (const capability of CAPABILITIES) {
    const command = read(`commands/${capability}.md`);
    assert.match(command, new RegExp(`plus-ultra:${capability}`), `${capability} command must route to its skill`);

    const codexInterface = read(`skills/${capability}/agents/openai.yaml`);
    assert.match(codexInterface, /display_name:/);
    assert.match(codexInterface, new RegExp(`\\$${capability}`));
  }

  const commands = listDir("commands").map((entry) => entry.name).sort();
  assert.deepEqual(commands, CAPABILITIES.map((name) => `${name}.md`).sort());
});

test("retired subsystems leave no implementation or reference behind", () => {
  for (const path of [
    "benchmarks",
    "specs",
    "skills/pr-review",
    "skills/context-handoffs",
    "skills/design-artifacts",
    "skills/verification",
    "skills/workflow-risk",
    "skills/spec-conventions",
    "scripts/context-reducers.mjs",
    "scripts/benchmark",
    "scripts/codex-local.mjs",
    "hooks/session-start.mjs",
    "hooks/pr-description-reminder.mjs",
    "agents/pr-reviewer.md",
    "docs/benchmarking.md",
  ]) {
    assert.ok(!existsSync(join(repoRoot, path)), `${path} must not exist after the reboot`);
  }

  const retired = [
    /plus-ultra:pr-review\b/,
    /plus-ultra:context-handoffs/,
    /plus-ultra:design-artifacts/,
    /plus-ultra:verification/,
    /plus-ultra:workflow-risk/,
    /plus-ultra:spec-conventions/,
    /plus-ultra:issue-management/,
    /plus-ultra:tech-stack/,
    /context reducer/i,
    /verification receipt/i,
    /review snapshot/i,
    /token benchmark/i,
    /plus-ultra-verify/,
  ];
  for (const skill of SKILLS) {
    const content = read(`skills/${skill}/SKILL.md`);
    for (const pattern of retired) {
      assert.doesNotMatch(content, pattern, `skills/${skill}/SKILL.md still references retired machinery`);
    }
  }
});

test("implement-issue owns the whole Issue-to-PR path", () => {
  const skill = read("skills/implement-issue/SKILL.md");

  // Material decisions escalate; only reversible details are assumed.
  assert.match(skill, /\*\*Ask the human\*\*/);
  assert.match(skill, /product behaviour, user-visible UX, security or\n?privacy, data shape or migration, a public or cross-service contract/);
  assert.match(skill, /\*\*Assume and proceed\*\* only for low-impact, reversible implementation details/);

  // Depth is a heuristic inside this skill, not a user-facing protocol.
  for (const depth of ["Small", "Normal", "High-risk"]) {
    assert.match(skill, new RegExp(`\\*\\*${depth}\\*\\*`), `depth table must contain ${depth}`);
  }
  assert.match(skill, /Unresolved uncertainty raises depth; it never lowers it\./);

  // The remaining steps of the loop.
  assert.match(skill, /## 4\. Design checkpoint/);
  assert.match(skill, /## 6\. Verify/);
  assert.match(skill, /## 7\. Independent review/);
  assert.match(skill, /plus-ultra:code-review/);
  assert.match(skill, /plus-ultra:integration-boundary/);
  assert.match(skill, /ready for review\*\* and stop/);

  // No verification wrapper, no persisted workflow state, no mandatory handoff.
  assert.match(skill, /do not add a verification\nwrapper/);
  assert.doesNotMatch(skill, /handoff/i);
});

test("independent review is mandatory only for high-risk work", () => {
  const skill = read("skills/implement-issue/SKILL.md");
  assert.match(skill, /\*\*Mandatory\*\* for high-risk work/);
  assert.match(skill, /For normal work use it \*\*when warranted\*\*/);
  assert.match(skill, /Small work skips it by default/);

  const depth = read("skills/implement-issue/references/depth.md");
  assert.match(depth, /Independent review \*\*when warranted\*\*/);
  assert.match(depth, /Independent review is \*\*mandatory\*\* and cannot be waived by confidence/);
  assert.match(depth, /No written plan, no spec, no independent review by default/);
});

test("a technical spec is optional and has no lifecycle", () => {
  const depth = read("skills/implement-issue/references/depth.md");
  assert.match(depth, /A refined Issue is the default contract/);
  assert.match(depth, /If you\ncannot name which decision the spec settles, the Issue is enough — skip it\./);

  const conventions = read("skills/conventions/SKILL.md");
  assert.match(conventions, /Specs are optional/);
  assert.match(conventions, /There is no draft\/approved\/superseded\nlifecycle/);

  // No skill may treat an approved spec as a precondition for reviewing or
  // shipping. `conventions` is exempt: it is the file that denies the lifecycle.
  for (const skill of SKILLS.filter((name) => name !== "conventions")) {
    assert.doesNotMatch(
      read(`skills/${skill}/SKILL.md`),
      /status:\s*approved|approved technical contract|superseded/i,
      `skills/${skill}/SKILL.md must not revive the spec lifecycle`
    );
  }
});

test("code review is Issue-first, read-only, and does not require a spec", () => {
  const skill = read("skills/code-review/SKILL.md");
  assert.match(skill, /The contract is the Issue's acceptance criteria/);
  assert.match(skill, /Do not require a spec\./);
  assert.match(skill, /\*\*Do not modify files\.\*\*/);
  assert.match(skill, /gh issue view <number>/);
  assert.match(skill, /Only report what you can substantiate/);

  const agent = read("agents/code-reviewer.md");
  assert.match(agent, /plus-ultra:code-review/);
  assert.match(agent, /A spec is optional; never treat its absence as a reason to stop\./);
  assert.match(agent, /must not modify files/);
  // The reviewer subagent must not be handed write tools.
  assert.match(agent, /^tools: Read, Grep, Glob, Bash$/m);
});

test("engineering principles are a conditional reference, not a ninth skill", () => {
  const reference = read("skills/conventions/references/engineering-principles.md");

  // Principles, not a layout to reproduce.
  assert.match(reference, /simplest architecture that keeps the important logic testable and changeable/i);
  assert.match(reference, /Keep non-trivial business rules out of transport, UI, and persistence glue/i);
  assert.match(reference, /Isolate side effects when isolation materially helps/i);
  assert.match(reference, /Prefer explicit, pure business logic where it fits/i);
  assert.match(reference, /Repository conventions override these defaults/i);
  assert.match(reference, /Never add layers, ports, or adapters to trivial work to satisfy a pattern/i);
  assert.match(reference, /They tell you what to weigh;\nthey do not tell you which directories to create/);

  // It must not smuggle back a mandated layout or a default stack.
  assert.doesNotMatch(reference, /^\s*(?:src\/|apps\/|packages\/)/m, "must not mandate a folder layout");
  assert.doesNotMatch(reference, /Hono|Drizzle|Neon|React|shadcn|pnpm|vitest|Biome/i, "must not name a stack");

  // Both consumers load it, and only for work that warrants it. Line wrapping
  // differs per file, so compare on normalized whitespace.
  const trigger =
    "materially involves business rules, architecture, persistence, external integrations, " +
    "or side-effect isolation";
  for (const skill of ["conventions", "implement-issue", "code-review"]) {
    const content = read(`skills/${skill}/SKILL.md`).replace(/\s+/g, " ");
    assert.match(
      content,
      /engineering principles|engineering-principles/i,
      `skills/${skill}/SKILL.md must reference the principles`
    );
    assert.ok(content.includes(trigger), `skills/${skill}/SKILL.md must state the load condition`);
    assert.match(
      content,
      /(?:ordinary )?small and local|small, local/i,
      `skills/${skill}/SKILL.md must exclude ordinary small work`
    );
  }

  // Still eight skills; the reference must not become one.
  assert.ok(!existsSync(join(repoRoot, "skills/engineering-principles")));
  assert.ok(!existsSync(join(repoRoot, "skills/tech-stack")));
});

test("the design checkpoint is human-approved and carries no artifact platform", () => {
  const refine = read("skills/refine-issue/SKILL.md");
  assert.match(refine, /\*\*Design checkpoint\.\*\*/);
  assert.match(refine, /get explicit human approval/);

  const implement = read("skills/implement-issue/SKILL.md");
  assert.match(implement, /Never invent significant interface direction while coding\./);
  assert.match(implement, /wherever it is cheapest/);

  for (const content of [refine, implement]) {
    assert.doesNotMatch(content, /manifest/i, "the design checkpoint must not reintroduce manifests");
    assert.doesNotMatch(content, /deterministic resolution/i);
  }
});

test("product owns the brief and every other skill only reads it", () => {
  const product = read("skills/product/SKILL.md");
  assert.match(product, /Only this skill writes `docs\/product\.md`/);
  assert.match(product, /offer two or three real alternatives/);
  assert.match(product, /give your recommendation and why/);
  assert.match(product, /Challenge scope that has no clear line to the MVP hypothesis/);
  assert.match(product, /only after explicit human approval/);
  // Contradictions are raised in conversation, not routed through a protocol.
  assert.match(product, /notice, name it, ask\./);

  const template = read("skills/product/assets/product.md");
  for (const section of ["Target user", "Core problem", "MVP hypothesis", "Non-goals", "Success criteria"]) {
    assert.match(template, new RegExp(`^## ${section}$`, "m"));
  }

  for (const skill of SKILLS.filter((name) => name !== "product")) {
    assert.doesNotMatch(
      read(`skills/${skill}/SKILL.md`),
      /(?:write|create|update|edit)s? `docs\/product\.md`/i,
      `skills/${skill}/SKILL.md must not write the brief`
    );
  }
});

test("GitHub workflows gate writes behind explicit confirmation", () => {
  const roadmap = read("skills/roadmap/SKILL.md");
  assert.match(roadmap, /\*\*explicit confirmation\*\*/);
  assert.match(roadmap, /Create nothing before it\./);
  assert.match(roadmap, /viewerPermission/);
  assert.match(roadmap, /gh issue create --parent <parent>/);
  assert.match(roadmap, /type:epic/);
  assert.match(roadmap, /type:story/);
  assert.match(roadmap, /Never invent dates, assignees, estimates, or priorities/);

  const refine = read("skills/refine-issue/SKILL.md");
  assert.match(refine, /\*\*explicit confirmation\*\*/);
  assert.match(refine, /## Acceptance Criteria/);
  assert.match(refine, /plus-ultra:implement-issue/);
});

test("a minimum GitHub CLI version is declared and fails clearly", () => {
  const conventions = read("skills/conventions/SKILL.md");
  assert.match(conventions, /\*\*GitHub CLI 2\.94\.0 or newer\*\*/);
  assert.match(conventions, /check `gh --version`/);
  assert.match(
    conventions,
    /Plus Ultra requires GitHub CLI 2\.94\.0 or newer; found <version>\. Upgrade gh and retry\./
  );
  assert.match(conventions, /Do not fall back to GraphQL to emulate a missing hierarchy capability\./);

  // Workflows that write to GitHub must point at that requirement.
  for (const skill of ["roadmap", "refine-issue"]) {
    assert.match(read(`skills/${skill}/SKILL.md`), /plus-ultra:conventions/);
  }
});

test("transient artifacts stay local and durable ones are named", () => {
  const conventions = read("skills/conventions/SKILL.md");
  assert.match(conventions, /`\.context\/`/);
  assert.match(conventions, /Ensure `\.gitignore` contains `\/\.context\/`/);
  assert.match(conventions, /Conventional Commits/);
  assert.match(conventions, /BREAKING CHANGE/);
  assert.match(read(".gitignore"), /^\/\.context\/$/m);

  assert.match(read("skills/implement-issue/SKILL.md"), /Keep plans in `\.context\/`, which is local and never committed/);
});

test("the human integration boundary survives unchanged", () => {
  const boundary = read("skills/integration-boundary/SKILL.md");
  assert.match(boundary, /End autonomous implementation at \*\*ready for integration\*\* and stop\./);
  assert.match(boundary, /must not merge a PR or stack, enable auto-merge, push to the default\nbranch, create or publish a release, or create or publish a tag/);
  assert.match(boundary, /There is no `plus-ultra:integrate` command\./);
  assert.match(boundary, /Cursor ships the portable skill only/);
});

test("new-project defers the canonical template and keeps the baseline minimal", () => {
  const skill = read("skills/new-project/SKILL.md");
  assert.match(skill, /plus-ultra:product/);
  assert.match(skill, /wait for explicit human approval of the brief/);
  assert.match(skill, /A canonical Plus Ultra template repository will replace this step in a later iteration/);
  assert.match(skill, /leave every decision the product does not yet need/);
  assert.match(skill, /plus-ultra:roadmap/);
  // The old stack matrix must not come back with it.
  assert.doesNotMatch(skill, /pnpm workspaces|monorepo|hexagonal|Drizzle|shadcn/i);
  assert.ok(!existsSync(join(repoRoot, "skills/new-project/references/scaffold-blueprint.md")));
});

test("the documented workflow matches the five capabilities", () => {
  const readme = read("README.md");
  for (const capability of CAPABILITIES) {
    assert.match(readme, new RegExp(`plus-ultra:${capability}`), `README must document ${capability}`);
  }
  assert.match(readme, /Idea → new-project → product → roadmap → refine-issue → implement-issue/);
  assert.match(readme, /you merge/i);

  // Install and update instructions the release test also depends on.
  assert.match(readme, /codex plugin marketplace add maurocicerchia\/plus-ultra --ref main/);
  assert.match(readme, /claude plugin marketplace add maurocicerchia\/plus-ultra/);
});

test("portable skills stay agent-neutral", () => {
  for (const skill of SKILLS) {
    const content = read(`skills/${skill}/SKILL.md`);
    for (const pattern of [/CLAUDE_PLUGIN_ROOT/, /PLUGIN_ROOT/, /\bsubagent\b/i, /hooks\//, /\.claude-plugin/]) {
      assert.doesNotMatch(content, pattern, `skills/${skill}/SKILL.md leaks platform mechanics`);
    }
  }
});
