import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
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

// Runs one of the plugin's own PreToolUse hooks over a Bash command and returns
// its decision, so documented instructions can be checked against the guardrails
// that will actually see them.
function hookDecision(script, command) {
  const result = spawnSync(process.execPath, [join(repoRoot, "hooks", script)], {
    cwd: repoRoot,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const stdout = result.stdout.trim();
  return stdout ? JSON.parse(stdout) : {};
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, "file must start with YAML frontmatter");
  const name = match[1].match(/^name:\s*(.+)$/m);
  const description = match[1].match(/^description:\s*(.+)$/m);
  return { name: name?.[1].trim(), description: description?.[1].trim() };
}

// The canonical `DESIGN.md` sections, in the order the Google Labs convention fixes them.
// Plus Ultra follows that format rather than maintaining a schema of its own.
const DESIGN_SECTIONS = [
  "Overview",
  "Colors",
  "Typography",
  "Layout",
  "Elevation & Depth",
  "Shapes",
  "Components",
  "Do's and Don'ts",
];
// The custom headings Plus Ultra used before adopting the convention. Nothing may depend on them.
const RETIRED_DESIGN_SECTIONS = [
  "Visual direction",
  "Spacing and shape",
  "Component principles",
  "Interaction principles",
  "Responsive behaviour",
];

// The five user-facing capabilities, in workflow order.
const CAPABILITIES = ["new-project", "product", "roadmap", "refine-issue", "implement-issue"];
// Shared policy and helper skills the capabilities lean on.
const SUPPORTING = ["conventions", "integration-boundary"];
const SKILLS = [...CAPABILITIES, ...SUPPORTING];

test("the plugin ships exactly the reboot skill set", () => {
  const present = listDir("skills")
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(present, [...SKILLS].sort());

  const maintainer = read("docs/maintainer-guide.md").replace(/\s+/g, " ");
  assert.ok(
    maintainer.includes("two they share (`conventions`, `integration-boundary`)"),
    "the maintainer guide must name the current supporting skills"
  );
  assert.ok(maintainer.includes("skills/implement-issue/references/code-review.md"));
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
  assert.ok(
    skill.replace(/\s+/g, " ").includes(
      "product behaviour, user-visible UX, security or privacy, data shape or migration, a public " +
        "or cross-service contract"
    )
  );
  assert.match(skill, /\*\*Assume and proceed\*\* only for low-impact, reversible implementation details/);

  // Depth is a heuristic inside this skill, not a user-facing protocol.
  for (const depth of ["Small", "Normal", "High-risk"]) {
    assert.match(skill, new RegExp(`\\*\\*${depth}\\*\\*`), `depth table must contain ${depth}`);
  }
  assert.match(skill, /Unresolved uncertainty raises depth; it never lowers it\./);

  // The table routes; the reference the table points at holds each depth's controls and path.
  const depth = read("skills/implement-issue/references/depth.md").replace(/\s+/g, " ");
  assert.ok(depth.includes("The path is implement → focused tests → PR."));
  assert.ok(depth.includes("The path is short plan → implement → tests → review when warranted → fix → PR."));
  assert.ok(
    depth.includes("The path is technical contract → plan → stronger verification → mandatory review → PR.")
  );

  // The remaining steps of the loop.
  assert.match(skill, /## 4\. Design checkpoint/);
  assert.match(skill, /## 6\. Verify/);
  assert.match(skill, /## 7\. Independent review/);
  assert.match(skill, /references\/code-review\.md/);
  assert.match(skill, /plus-ultra:integration-boundary/);
  assert.match(skill, /ready for review\*\* and stop/);

  // Harness feedback is conditional on observed friction, and scoped to Plus Ultra itself rather
  // than to the repository being worked on. Assert both halves independently of the wording.
  const harness = skill.replace(/\s+/g, " ").match(/[^.]*harness[- ]?feedback[^.]*\./i)?.[0] ?? "";
  assert.match(harness, /only when this Issue exposed real/i, "harness feedback stays conditional");
  assert.match(harness, /Plus Ultra/, "harness feedback stays scoped to Plus Ultra itself");

  // No verification wrapper, no persisted workflow state, no mandatory handoff.
  assert.ok(skill.replace(/\s+/g, " ").includes("do not add a verification wrapper"));
  assert.doesNotMatch(skill, /handoff/i);
});

test("an approved refined Story is not sent back through generic approval gates", () => {
  const implement = read("skills/implement-issue/SKILL.md");
  const flat = implement.replace(/\s+/g, " ");

  assert.ok(
    flat.includes(
      "An explicitly approved refined Story satisfies generic product, design, and brainstorming " +
        "approval gates"
    ),
    "implement-issue must not reopen an approved refinement for a generic gate"
  );
  assert.ok(
    flat.includes(
      "Never reopen what the Issue, `docs/product.md`, `DESIGN.md`, or an approved design settled"
    ),
    "the settled sources must be named"
  );
  // Complementary methodologies still supply planning, TDD, and review mechanics.
  assert.match(flat, /complementary methodologies supply mechanics, not approval gates/);

  // The human boundary reopens only for something genuinely new.
  assert.match(flat, /\*\*Ask the human\*\* on new material ambiguity or contradiction/);
  assert.match(implement, /Never invent significant interface direction while coding\./);
});

test("intermediate verification is focused and the final head gets the whole suite", () => {
  const implement = read("skills/implement-issue/SKILL.md").replace(/\s+/g, " ");
  assert.ok(
    implement.includes(
      "Intermediate commits may run focused tests and a scoped typecheck or package check for the " +
        "changed area"
    ),
    "intermediate work must not imply a full repository suite per commit"
  );
  assert.ok(
    implement.includes(
      "The repository's full test, typecheck, lint, and build scripts are mandatory on the final " +
        "committed head before PR readiness"
    ),
    "the final committed head must still carry complete verification"
  );

  const depthRaw = read("skills/implement-issue/references/depth.md");
  assert.match(depthRaw, /^## Verification cadence$/m);
  const depth = depthRaw.replace(/\s+/g, " ");
  assert.ok(
    depth.includes(
      "Intermediate commits carry focused tests for the changed behaviour plus a typecheck or " +
        "package check scoped to the changed area"
    )
  );
  assert.match(depth, /Widen that deliberately/);
  assert.ok(
    depth.includes(
      "mandatory on the final committed head before the change is ready for review, and again on " +
        "the head that follows blocker fixes"
    )
  );

  // Exact-head review and the re-review after blocker fixes survive the cadence change.
  assert.match(depth, /Independent review pins that exact head/);
  assert.match(depth, /a re-verified head is a new head and needs its own review pass/);

  const review = read("skills/implement-issue/references/code-review.md").replace(/\s+/g, " ");
  assert.ok(review.includes("That verification is the repository's complete run"));
  assert.ok(review.includes("on the head about to be pinned, not a focused intermediate check"));
  assert.match(review, /After blocker fixes, repeat that complete verification/);
});

test("refinement verifies owned artifacts without routine application verification", () => {
  const refine = read("skills/refine-issue/SKILL.md");
  const detail = read("skills/refine-issue/references/verification.md");
  assert.match(refine, /no verification-relevant implementation input/i);
  for (const check of ["tests", "typecheck", "lint", "build"]) {
    assert.match(refine, new RegExp(check), `refinement must address ${check}`);
  }
  assert.match(detail, /Issue content/);
  assert.match(detail, /read-back/);
  assert.match(detail, /structural and visual audits in\s+\[feature-design\.md\]/);
  assert.match(detail, /Git-reachable/);
  assert.match(detail, /implementation artifact/);
});

test("engineering guidance names workflow ownership and review consequences", () => {
  const principles = read("skills/conventions/references/engineering-principles.md");
  const review = read("skills/implement-issue/references/code-review.md");
  const flat = principles.replace(/\s+/g, " ");
  assert.match(flat, /Transport translates\. Application orchestrates\. Domain decides\. Persistence stores\./);
  for (const concern of ["retry", "partial failure", "idempotency", "commit", "multiple delivery", "transport-independent"]) {
    assert.match(flat, new RegExp(concern, "i"));
  }
  assert.match(flat, /do not require controller classes/i);
  assert.match(flat, /do not mandate repositories/i);
  assert.match(review, /duplicated behavior|duplicated behaviour/i);
  assert.match(review, /transport-owned failure semantics/i);
});

test("depth follows state-change failure semantics and auth boundary changes", () => {
  const depth = read("skills/implement-issue/references/depth.md");
  for (const concern of ["retr(?:y|ies)", "idempoten", "duplicate", "concurrency", "partial", "commit", "irreversible", "recovery"]) {
    assert.match(depth, new RegExp(concern, "i"));
  }
  assert.match(depth, /authentication\/authorization boundary/);
  assert.match(depth, /already-established auth boundary/);
});

test("an approved design becomes durable before implementation depends on it", () => {
  const design = read("skills/refine-issue/references/feature-design.md").replace(/\s+/g, " ");

  // build → validate → one approval → commit → Git → Issue → unblocked.
  assert.ok(
    design.includes(
      "Then hand off in order: present the refined Issue proposal and the validated design together"
    )
  );
  assert.match(design, /one explicit human approval covers both/);
  assert.match(design, /commit the approved artifact at `designs\/<issue>-<slug>\.html`/);
  assert.match(
    design,
    /open a pull request with it against the default branch, on which implementation may stack/
  );
  assert.match(design, /record its path and Git reference in the Issue/i);
  assert.match(design, /is implementation unblocked on the design artifact/);

  // A temporary marker is allowed until the real reference exists.
  assert.match(design, /`Approved design pending durable Git reference\.`/);
  assert.match(design, /until the real path replaces it/);

  const refine = read("skills/refine-issue/SKILL.md").replace(/\s+/g, " ");
  assert.ok(
    refine.includes(
      "One explicit human approval may cover both the displayed Issue proposal and the concrete " +
        "design when presented together"
    ),
    "one approval may cover the Story proposal and the embedded design"
  );

  // Readiness is prose, not a state machine: three phrases, no labels or statuses.
  assert.match(refine, /\*\*refined and approved\*\* once material product and design decisions are settled/);
  assert.match(
    refine,
    /\*\*ready for implementation\*\* once its dependencies and any approved design are also durably reachable through Git/
  );
  assert.match(refine, /\*\*refined but blocked\*\* otherwise, naming the blocker/);

  for (const skill of SKILLS) {
    assert.doesNotMatch(
      read(`skills/${skill}/SKILL.md`),
      /design registry|design manifest|design lifecycle|`?(?:status|label):\s*design/i,
      `skills/${skill}/SKILL.md must not add design status machinery`
    );
  }
});

test("independent review is mandatory only for high-risk work", () => {
  const skill = read("skills/implement-issue/SKILL.md");
  const flat = skill.replace(/\s+/g, " ");
  assert.match(skill, /\*\*Mandatory\*\* for high-risk work/);
  assert.ok(flat.includes("For normal work use it **when warranted**"));
  assert.ok(flat.includes("Small work skips it by default"));

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

test("verifying before a commit is a skill instruction with CI as the backstop", () => {
  const conventions = read("skills/conventions/SKILL.md");
  assert.match(conventions, /^description: Use when committing,/m);
  const flat = conventions.replace(/\s+/g, " ");
  assert.ok(flat.includes("Verify before every commit"));
  assert.ok(flat.includes("commit only when they pass"));
  assert.ok(flat.includes("CI is the backstop for what escapes local verification"));
});

test("code review is one on-demand implement-issue reference", () => {
  assert.ok(!existsSync(join(repoRoot, "skills/code-review")), "code review must not consume a skill slot");

  const implement = read("skills/implement-issue/SKILL.md");
  const review = read("skills/implement-issue/references/code-review.md");
  const reviewFlat = review.replace(/\s+/g, " ");
  assert.match(implement, /references\/code-review\.md/);
  assert.ok(reviewFlat.includes("The contract is the Issue's acceptance criteria"));
  assert.ok(reviewFlat.includes("Do not require a spec."));
  assert.match(review, /\*\*Do not modify files\.\*\*/);
  assert.match(review, /gh issue view <number>/);
  assert.match(review, /Only report what you can substantiate/);

  // Reviews bind to immutable evidence, and blocker fixes invalidate the old verdict.
  assert.match(review, /exact head SHA/i);
  assert.match(review, /git rev-parse HEAD/);
  assert.match(review, /head moves/i);
  assert.match(review, /blocker fixes/i);
  assert.match(review, /final review pass/i);

  // A SHA pins only committed state. Dirty implementation changes must never be omitted.
  assert.match(review, /git status --short/);
  assert.match(reviewFlat, /implementation state.*verified.*committed.*working tree.*clean/i);
  assert.match(reviewFlat, /tracked changes differ from `HEAD`.*do not review/i);
  assert.match(reviewFlat, /return control to the implementer.*verify and commit/i);
  assert.match(reviewFlat, /After blocker fixes.*repeat.*clean-worktree gate.*final review/i);
  assert.match(reviewFlat, /working tree becomes dirty during review.*discard the verdict/i);

  const agent = read("agents/code-reviewer.md");
  assert.match(agent, /skills\/implement-issue\/references\/code-review\.md/);
  assert.match(agent, /A spec is optional; never treat its absence as a reason to stop\./);
  assert.match(agent, /must not modify files/);
  // The reviewer subagent must not be handed write tools.
  assert.match(agent, /^tools: Read, Grep, Glob, Bash$/m);
  assert.doesNotMatch(agent, /^## (?:Gather|Check|Report)$/m, "the reviewer agent must not duplicate the contract");
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
  for (const path of [
    "skills/conventions/SKILL.md",
    "skills/implement-issue/SKILL.md",
    "skills/implement-issue/references/code-review.md",
  ]) {
    const content = read(path).replace(/\s+/g, " ");
    assert.match(
      content,
      /engineering principles|engineering-principles/i,
      `${path} must reference the principles`
    );
    assert.ok(content.includes(trigger), `${path} must state the load condition`);
    assert.match(
      content,
      /(?:ordinary )?small and local|small, local/i,
      `${path} must exclude ordinary small work`
    );
  }

  // The reference must not become a skill.
  assert.ok(!existsSync(join(repoRoot, "skills/engineering-principles")));
  assert.ok(!existsSync(join(repoRoot, "skills/tech-stack")));
});

test("only Stories take the Issue-to-PR path", () => {
  const implement = read("skills/implement-issue/SKILL.md");
  assert.match(implement, /The implementation unit is a Story\./);
  assert.match(implement, /If the Issue carries `type:epic`, stop/);
  assert.match(implement, /an Epic is a container,\nnot a unit of work/);
  assert.match(implement, /Route it to `plus-ultra:refine-issue` or `plus-ultra:roadmap` for decomposition/);
  // Existing repositories without the taxonomy must not be blocked by it.
  assert.match(implement, /untyped Issue in an\s+existing repository, proceeds normally/);

  const refine = read("skills/refine-issue/SKILL.md");
  // Refinement may sharpen an Epic, but may never declare one ready to build.
  assert.match(refine, /An Epic may be refined/);
  assert.match(refine, /it is never ready to implement/);
  assert.match(refine, /Only a Story, or an untyped Issue\nin an existing repository, may be marked ready/);
  assert.match(refine, /hand a refined Epic to decomposition instead/);
});

test("new-project stops before publishing the initial default branch", () => {
  const skill = read("skills/new-project/SKILL.md");
  const flat = skill.replace(/\s+/g, " ");
  assert.ok(flat.includes("Make the first commit locally."));
  assert.match(skill, /\*\*Stop there\.\*\*/);
  assert.match(skill, /`plus-ultra:integration-boundary` reserves default-branch pushes for a human/);
  // The gate does not classify `gh repo create --push`, so the prose must.
  assert.match(skill, /including `gh repo create --push`/);
  assert.match(skill, /Do not look for a bootstrap exception; there is none\./);
  assert.ok(flat.includes("the exact commands the human runs to create the remote"));

  // No skill may claim publishing a repository is ordinary preparation.
  for (const name of SKILLS) {
    assert.doesNotMatch(
      read(`skills/${name}/SKILL.md`),
      /pushing it is ordinary preparation|bootstrap exception is|initial push is allowed/i,
      `skills/${name}/SKILL.md must not carve out a bootstrap exception`
    );
  }
});

test("the design checkpoint is human-approved and carries no artifact platform", () => {
  const refine = read("skills/refine-issue/SKILL.md");
  assert.match(refine, /\*\*Design checkpoint\.\*\*/);
  assert.match(refine, /get explicit human approval/);

  const implement = read("skills/implement-issue/SKILL.md");
  assert.match(implement, /Never invent significant interface direction while coding\./);
  assert.ok(implement.replace(/\s+/g, " ").includes("get explicit human approval before implementing it"));
  // Where the approved reference lives moved to the on-demand reference.
  assert.match(read("skills/implement-issue/references/depth.md"), /wherever it is cheapest/);
  assert.match(
    read("skills/implement-issue/references/depth.md").replace(/\s+/g, " "),
    /Do not build a versioning scheme, manifest, or lifecycle around it\./
  );

  for (const content of [refine, implement]) {
    assert.doesNotMatch(content, /manifest/i, "the design checkpoint must not reintroduce manifests");
    assert.doesNotMatch(content, /deterministic resolution/i);
  }
});

test("a feature design is one self-contained HTML file with no toolchain", () => {
  const design = read("skills/refine-issue/references/feature-design.md");
  const flat = design.replace(/\s+/g, " ");
  assert.ok(flat.includes("`DESIGN.md` is the approved product-level visual direction"));
  assert.ok(
    flat.includes("`designs/<issue>-<slug>.html` becomes the approved feature-level reference after human approval")
  );
  assert.match(flat, /never ships or imports it/);

  // Zero dependencies: nothing outside the file, no build, no framework.
  assert.match(flat, /one self-contained HTML file/i);
  assert.match(flat, /inline `<style>`/);
  for (const banned of ["CDN", "remote font", "remote script", "package", "build step"]) {
    assert.ok(flat.includes(banned), `feature designs must rule out ${banned}`);
  }
  assert.match(flat, /no JavaScript by default/i);
  assert.match(flat, /`<details>` or `:target`/);

  // Product tokens carry into the feature design by name.
  assert.match(flat, /`DESIGN\.md` tokens to CSS custom properties on `:root`/);
  assert.match(flat, /own `<section>` with a stable `id`/);
  assert.match(flat, /responsive behaviour/i);
});

test("feature design approval requires structural, visual, and durable evidence", () => {
  const design = read("skills/refine-issue/references/feature-design.md");
  const flat = design.replace(/\s+/g, " ");
  for (const evidence of [
    "Every expected screen and state has its own section",
    "points outside the file",
    "no placeholder text remains",
    "token custom properties",
    "inspect every section at each relevant width",
    "responsive behavior",
    "validation and success states",
    "ask the human to open the file",
  ]) {
    assert.ok(flat.includes(evidence), `feature design validation must require ${evidence}`);
  }
  assert.match(flat, /Neither audit replaces the other/);
  assert.match(flat, /durably reachable through Git/i);
  assert.match(flat, /implementation worktree/i);
  assert.match(flat, /Until then, refinement is complete but implementation is blocked/i);
  for (const machinery of ["renderer", "component library", "generator", "parser", "manifest", "versioning"]) {
    assert.match(flat, new RegExp(`Do not add .*${machinery}`, "i"));
  }

  // The design guidance is an on-demand reference, not a skill or a command.
  assert.ok(!existsSync(join(repoRoot, "skills/pencil-design")));
  assert.ok(!existsSync(join(repoRoot, "commands/feature-design.md")));
});

test("refinement prefers an HTML design and implementation reads it directly", () => {
  const refine = read("skills/refine-issue/SKILL.md").replace(/\s+/g, " ");
  assert.ok(refine.includes("read root `DESIGN.md`"));
  assert.ok(refine.includes("[feature-design.md](./references/feature-design.md)"));
  assert.match(refine, /preferred reference is a self-contained HTML file/i);
  assert.match(refine, /screenshot or described reference is the fallback/i);
  assert.ok(refine.includes("`designs/<issue>-<slug>.html`"));
  assert.match(refine, /explicit human approval/i);
  assert.match(refine, /durably reachable through Git/i);

  const implement = read("skills/implement-issue/SKILL.md").replace(/\s+/g, " ");
  assert.match(implement, /Design references an `\.html` file/);
  assert.match(implement, /approved feature-level/i);
  assert.match(implement, /rebuild it in the product's own stack; never ship or import it/);
  assert.match(implement, /do not redesign/i);
  assert.match(implement, /`DESIGN\.md`.*product-level/i);

  const depth = read("skills/implement-issue/references/depth.md").replace(/\s+/g, " ");
  assert.ok(depth.includes("An HTML design uses `designs/<issue>-<slug>.html`"));
  assert.ok(depth.includes("present in the later implementation worktree"));

  // No portable content may depend on Pencil any more.
  for (const path of [
    "skills/refine-issue/SKILL.md",
    "skills/refine-issue/references/verification.md",
    "skills/refine-issue/references/feature-design.md",
    "skills/implement-issue/SKILL.md",
    "skills/implement-issue/references/depth.md",
    "docs/maintainer-guide.md",
  ]) {
    assert.doesNotMatch(read(path), /Pencil|\.pen\b/, `${path} must not reference Pencil`);
  }
});

test("design discovery runs only for products with a real interface", () => {
  const skill = read("skills/new-project/SKILL.md").replace(/\s+/g, " ");
  assert.match(read("skills/new-project/SKILL.md"), /^## 2\. Design discovery/m);
  assert.ok(skill.includes("whether the product has a meaningful user interface"));
  assert.ok(
    skill.includes("A library, CLI, service, or data pipeline does not: skip this step and load nothing for it"),
    "non-UI products must skip design discovery and pay no context cost"
  );
  assert.ok(skill.includes("human-approved `DESIGN.md` at the repository root"));
  assert.ok(skill.includes("references/design-brief.md"), "the detail must stay in an on-demand reference");
  assert.ok(
    skill.includes("Feature-specific UI stays where it already is, in the Issue design checkpoint"),
    "the per-feature checkpoint must survive"
  );
  assert.ok(skill.includes("the approved `DESIGN.md` at the root, when step 2 produced one"));
});

test("the design brief is adaptive, approved, and carries no lifecycle", () => {
  const reference = read("skills/new-project/references/design-brief.md");
  const flat = reference.replace(/\s+/g, " ");

  // Adaptive and recommendation-driven, never a fixed questionnaire.
  assert.match(reference, /\*\*one material visual decision at a time\*\*/);
  assert.match(reference, /offer two or three real alternatives/);
  assert.match(reference, /give your recommendation and why/);
  assert.ok(flat.includes("This is a short conversation, not a fixed questionnaire"));

  // Inferred context is carried as a working assumption; only material ones are surfaced.
  assert.ok(flat.includes("Carry those inferences as working assumptions and do not ask about them again"));
  assert.ok(
    flat.includes("Surface an assumption only when it is materially uncertain or consequential"),
    "discovery must not restate every inference"
  );
  assert.ok(flat.includes("do not recite the ones that are obvious from the brief"));

  // Proposed in full, written only on approval.
  assert.match(reference, /\*\*complete proposed document\*\*/);
  assert.ok(flat.includes("only after explicit human approval"));
  assert.ok(flat.includes("A declined or unanswered proposal leaves the repository unchanged"));

  // Durable and product-level, not a screen or component specification.
  assert.ok(flat.includes("not a component catalogue and it does not describe individual screens"));
  assert.ok(flat.includes("Keep the first version concise"));
  for (const section of DESIGN_SECTIONS) {
    assert.ok(flat.includes(`| ${section} |`), `the reference must say what ${section} settles`);
  }

  // It changes through a design decision, and grows no subsystem around itself.
  assert.ok(flat.includes("never as a side effect of implementing a feature"));
  assert.ok(
    flat.includes(
      "When refinement finds that a Story needs direction this document does not cover, that is the path: " +
        "propose the direction and the smallest corresponding edit together, get approval for both, then " +
        "change only what the decision touched"
    ),
    "the brief must name its own evolution path"
  );
  assert.ok(
    flat.includes("Do not grow a version history, a changelog, a status field, or a generated token file around it")
  );
  for (const pattern of [/manifest/i, /resolver/i, /snapshot/i, /lifecycle/i, /token compiler/i]) {
    assert.doesNotMatch(reference, pattern, "the design brief must not revive the design-artifact subsystem");
  }
  assert.ok(!existsSync(join(repoRoot, "skills/design")));
});

test("the shipped DESIGN.md follows the canonical Google Labs structure", () => {
  const asset = read("skills/new-project/assets/DESIGN.md");

  // Every heading the asset ships is canonical, and they appear in the order the format fixes.
  const headings = [...asset.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  assert.deepEqual(headings, DESIGN_SECTIONS, "the asset must ship the canonical sections in order");

  // The convention allows one optional title heading above them and nothing deeper.
  assert.equal([...asset.matchAll(/^# (?!#).+$/gm)].length, 1, "at most one h1 titles the document");
  assert.doesNotMatch(asset, /^#{3,} /m, "the canonical sections are h2, with no imposed subheadings");

  // Plus Ultra's own section schema is gone from everything that produces or describes the brief.
  const reference = read("skills/new-project/references/design-brief.md");
  for (const retired of RETIRED_DESIGN_SECTIONS) {
    for (const [label, content] of [["asset", asset], ["reference", reference]]) {
      assert.doesNotMatch(content, new RegExp(`^## ${retired}$`, "m"), `${label} still heads "${retired}"`);
      assert.ok(!content.includes(`| ${retired} |`), `${label} still tabulates "${retired}"`);
    }
  }

  // The format is named and linked once, and never transcribed into this repository.
  assert.ok(reference.includes("https://github.com/google-labs-code/design.md"));
  assert.ok(
    reference.replace(/\s+/g, " ").includes("never copy it into this repository"),
    "the reference must defer to the specification rather than duplicate it"
  );
});

test("structured frontmatter is emitted only for tokens the product actually settled", () => {
  const flat = read("skills/new-project/references/design-brief.md").replace(/\s+/g, " ");

  assert.ok(flat.includes("Emit it **only for values the conversation actually settled**"));
  assert.ok(flat.includes("No settled values means no frontmatter at all"));
  assert.ok(
    flat.includes("inventing some to fill the block manufactures decisions nobody approved"),
    "frontmatter must never be filled speculatively"
  );
  // Structured values and prose carry different things, so neither restates the other.
  assert.ok(flat.includes("Do not repeat a colour or a step in prose that the frontmatter already states"));
  assert.ok(flat.includes("do not paraphrase the body back into YAML"));
  for (const group of ["colors", "typography", "spacing", "rounded", "components"]) {
    assert.ok(flat.includes(`\`${group}\``), `the reference must name the ${group} token group`);
  }

  // The asset is a skeleton: no frontmatter block and no invented token values in it.
  const asset = read("skills/new-project/assets/DESIGN.md");
  assert.doesNotMatch(asset, /^---$/m, "the asset must not ship a speculative frontmatter block");
  assert.doesNotMatch(asset, /#[0-9a-f]{3,8}\b|\b\d+(?:px|rem|em)\b/i, "the asset must not invent token values");
});

test("adopting the format added no design subsystem to Plus Ultra", () => {
  for (const path of [
    "skills/design",
    "skills/design-md",
    "scripts/sync-design.mjs",
    "scripts/design-tokens.mjs",
    "commands/sync-design.md",
  ]) {
    assert.ok(!existsSync(join(repoRoot, path)), `${path} must not exist`);
  }
  assert.ok(!listDir("scripts").some((entry) => /design/i.test(entry.name)));
  assert.ok(!listDir("commands").some((entry) => /design/i.test(entry.name)));

  // The reference says so outright, so the next agent does not build one either.
  const flat = read("skills/new-project/references/design-brief.md").replace(/\s+/g, " ");
  assert.ok(
    flat.includes("do not build a parser, a theme generator, or a sync command to consume it"),
    "the brief must forbid the machinery the format tempts you to build"
  );
  assert.ok(flat.includes("A coding agent reads the approved document and applies it directly"));

  // The template stays unaware of the document's schema: the agent edits its neutral tokens.
  const template = read("skills/new-project/references/canonical-template.md").replace(/\s+/g, " ");
  assert.ok(template.includes("so it implements the approved `DESIGN.md`"));
  assert.doesNotMatch(template, /frontmatter|parse|token generator/i, "the template must not learn the schema");
});

test("only UI work loads DESIGN.md", () => {
  const refine = read("skills/refine-issue/SKILL.md").replace(/\s+/g, " ");
  assert.ok(refine.includes("If there is no significant UI, say so, move on, and read no design context at all"));
  assert.ok(refine.includes("read root `DESIGN.md` when it exists"));
  assert.ok(refine.includes("produce one concrete proposal consistent with that direction"));

  const implement = read("skills/implement-issue/SKILL.md").replace(/\s+/g, " ");
  assert.ok(implement.includes("Non-UI work reads nothing here"));
  assert.ok(implement.includes("read root `DESIGN.md` if it exists: approved product-level visual context"));

  const conventions = read("skills/conventions/SKILL.md");
  assert.match(
    conventions,
    /^\| Project design brief, for a product with a UI \| `DESIGN\.md` at the root \| yes \|$/m,
    "the artifact table must place DESIGN.md at the root and commit it"
  );
  assert.ok(
    conventions.replace(/\s+/g, " ").includes(
      "The design brief follows the [Google Labs `DESIGN.md` " +
        "convention](https://github.com/google-labs-code/design.md): Plus Ultra owns when it is created and " +
        "how it changes, that external format owns its structure"
    ),
    "conventions must name the format and who owns what"
  );
});

test("DESIGN.md evolves only through an approved product-level design decision", () => {
  const refine = read("skills/refine-issue/SKILL.md").replace(/\s+/g, " ");

  // Ordinary feature-level design never touches it.
  assert.ok(refine.includes("Feature-level design never touches `DESIGN.md`"));

  // Genuinely new product-level direction may, but only after explicit approval of both the
  // direction and the minimal edit — and the feature's own reference still lives on the Issue.
  assert.ok(
    refine.includes(
      "Where the Story genuinely needs **new product-level direction**, say so, propose that direction with " +
        "the smallest corresponding `DESIGN.md` change, and get explicit human approval for both"
    ),
    "refinement must propose direction and edit together, and get approval for both"
  );
  assert.ok(
    refine.includes(
      "Only then edit `DESIGN.md` — minimally, keeping every unaffected part verbatim — and still record the " +
        "feature's approved reference in the Issue"
    ),
    "the edit is minimal, post-approval, and does not replace the Issue-level record"
  );

  // Implementation stays read-only with respect to the file.
  const implement = read("skills/implement-issue/SKILL.md");
  assert.match(implement, /never change its\s+product-level direction here/);
  assert.doesNotMatch(
    implement,
    /(?:write|create|update|edit|change)s? `DESIGN\.md`/i,
    "implement-issue must never author DESIGN.md"
  );

  // No other skill authors it, and no lifecycle or workflow was added to let one.
  for (const skill of SKILLS.filter((name) => !["new-project", "refine-issue"].includes(name))) {
    assert.doesNotMatch(
      read(`skills/${skill}/SKILL.md`),
      /(?:write|create|update|edit|change)s? `DESIGN\.md`/i,
      `skills/${skill}/SKILL.md must not author DESIGN.md`
    );
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

test("new-project runs discovery first and hands off to roadmap", () => {
  const skill = read("skills/new-project/SKILL.md");
  assert.match(skill, /plus-ultra:product/);
  assert.match(skill, /wait for explicit human approval of the brief/);
  assert.match(skill, /plus-ultra:roadmap/);
  // The stack lives in the template repository, never in the always-loaded skill.
  assert.doesNotMatch(skill, /pnpm workspaces|monorepo|hexagonal|Drizzle|shadcn/i);
  assert.ok(!existsSync(join(repoRoot, "skills/new-project/references/scaffold-blueprint.md")));
});

test("the canonical template is the default for a compatible product, not an opt-in", () => {
  const skill = read("skills/new-project/SKILL.md").replace(/\s+/g, " ");
  assert.ok(skill.includes("## 3. Judge the canonical template".replace(/\s+/g, " ")));
  assert.ok(
    skill.includes("judge whether the canonical Plus Ultra template substantially fits the product"),
    "fit is judged from the approved brief"
  );
  assert.ok(skill.includes("references/canonical-template.md"), "the detail stays in an on-demand reference");
  assert.ok(
    skill.includes("the template is **the default, not an opt-in**: never ask whether to use it"),
    "a compatible product must not be asked to opt in"
  );
  assert.ok(
    skill.includes("never make the human re-select a default it owns"),
    "defaults the template owns must not be re-litigated"
  );

  const reference = read("skills/new-project/references/canonical-template.md").replace(/\s+/g, " ");
  assert.ok(reference.includes("MauroCicerchia/plus-ultra-template"), "the reference names the canonical repository");
  assert.ok(
    reference.includes("Do not ask \"do you want to use the template?\""),
    "the opt-in ceremony is prohibited in the reference too"
  );
  assert.ok(reference.includes("Compatibility is the only question to resolve"));
});

test("explicit human technology choices override the template", () => {
  const skill = read("skills/new-project/SKILL.md").replace(/\s+/g, " ");
  assert.ok(skill.includes("Explicit human technology choices always win"));
  assert.ok(skill.includes("Ask only about a material choice that remains open"));

  const reference = read("skills/new-project/references/canonical-template.md").replace(/\s+/g, " ");
  assert.ok(
    reference.includes(
      "An explicit human technology requirement overrides the template — for the whole choice when it is " +
        "incompatible, for that one piece when it is isolated"
    ),
    "an override may be total or scoped to the piece it names"
  );
});

test("fit has three verdicts and an isolated mismatch is adapted, not rebuilt", () => {
  const reference = read("skills/new-project/references/canonical-template.md");
  const flat = reference.replace(/\s+/g, " ");

  // Good fit, partial fit, fundamental mismatch — with what each one does.
  assert.ok(flat.includes("| Fits |"), "the reference must name the good-fit verdict");
  assert.ok(flat.includes("| Mostly fits |"), "the reference must name the partial-fit verdict");
  assert.ok(flat.includes("| Does not fit |"), "the reference must name the mismatch verdict");
  assert.ok(flat.includes("Instantiate and customize |"));
  assert.ok(flat.includes("Instantiate and adapt only the mismatch |"));
  assert.ok(flat.includes("Skip the template and bootstrap directly |"));

  // Partial fit: the examples from the story, and adaptation that keeps the project green.
  assert.ok(flat.includes("needs no persistence yet"));
  assert.ok(flat.includes("wants a different database or provider"));
  assert.ok(flat.includes("replaces one infrastructure piece while keeping the web stack"));
  assert.ok(
    flat.includes(
      "Remove or replace only the pieces that genuinely do not fit, and delete what they leave orphaned"
    ),
    "adaptation must be scoped to the mismatch"
  );
  assert.ok(flat.includes("report each material deviation and why the product required it"));

  // Fundamental mismatch: the story's examples, and the direct bootstrap as the fallback.
  assert.ok(flat.includes("A CLI or service in another language"));
  assert.ok(flat.includes("a native mobile application"));
  assert.ok(flat.includes("a reusable library or package"));
  assert.ok(
    flat.includes("If adaptation is turning into a rewrite, the verdict was \"does not fit\": bootstrap directly"),
    "adaptation must not silently become a rewrite"
  );

  const skill = read("skills/new-project/SKILL.md").replace(/\s+/g, " ");
  assert.ok(
    skill.includes("**Fundamental mismatch.** Say why the template was skipped, then initialize directly"),
    "skipping the template must be explained"
  );
  assert.ok(skill.includes("leave every decision the product does not yet need"));
});

test("instantiation materializes into the existing product root with fresh history", () => {
  const reference = read("skills/new-project/references/canonical-template.md");
  const flat = reference.replace(/\s+/g, " ");

  // The root already holds the approved context, so a clone into it cannot work.
  assert.ok(
    flat.includes("The root is not empty by the time you get here: `docs/product.md` is in it, and `DESIGN.md` too"),
    "the reference must state that the product root already exists"
  );
  assert.ok(
    flat.includes("Cloning over that root fails, and cloning elsewhere strands the approved context"),
    "both naive clone strategies must be named and rejected"
  );
  assert.ok(
    flat.includes("Stage the template under the transient `.context/` directory"),
    "the template must be staged transiently, not cloned into place"
  );
  assert.ok(
    flat.includes("Extraction leaves `docs/product.md` and `DESIGN.md` alone"),
    "the durable approved context must survive instantiation"
  );

  // The exact procedure: stage, materialize tracked files, start a deterministic history.
  assert.match(reference, /gh api repos\/MauroCicerchia\/plus-ultra-template\/tarball > \.context\/template\.tar\.gz/);
  assert.match(reference, /tar -xzf \.context\/template\.tar\.gz --strip-components=1/);
  assert.match(reference, /^rm \.context\/template\.tar\.gz$/m);
  assert.match(reference, /^git init -b main$/m);
  assert.ok(
    flat.includes("The tarball holds the template's tracked files and none of its commits"),
    "instantiation must produce fresh Git history"
  );

  // Creating the remote from the template would publish a default branch.
  assert.ok(
    flat.includes("Do not use `gh repo create --template`; it publishes a remote repository"),
    "the template path must not smuggle in remote creation"
  );
  assert.ok(flat.includes("plus-ultra:integration-boundary"));
  assert.ok(
    flat.includes("Do not clone and then delete a `.git` directory either: that needs a recursive force-delete"),
    "the reference must reject the clone-then-delete shape outright"
  );

  // Customization is the agent reading and editing files, not a rendering engine.
  assert.ok(flat.includes("There is no rendering engine and no configuration file to fill in"));
  assert.ok(flat.includes("package and workspace names, so they name this product"));
  assert.ok(flat.includes("the neutral starter screen and copy"));
  assert.ok(
    flat.includes("so it implements the approved `DESIGN.md`"),
    "the approved design brief must reach the theme foundation"
  );
  assert.ok(
    flat.includes("Skip the theme step when step 2 produced no `DESIGN.md`"),
    "a product without a design brief must not have direction invented for it"
  );
  assert.ok(
    flat.includes("Do not add a second template, a variant, a registry, a version pin, or a flag that selects"),
    "the reference must refuse a template subsystem"
  );
});

// The documented instantiation commands, with the network download swapped for a
// local fixture so the mechanics can be executed offline.
function instantiationScript(fixture) {
  const reference = read("skills/new-project/references/canonical-template.md");
  const block = reference.match(/```sh\n([\s\S]*?)```/);
  assert.ok(block, "the reference must show the instantiation commands");

  const lines = block[1].split("\n").filter((line) => line.trim());
  const downloads = lines.filter((line) => line.startsWith("gh api "));
  assert.equal(downloads.length, 1, "exactly one line fetches the template");

  return lines
    .map((line) => (line === downloads[0] ? `cp ${fixture} .context/template.tar.gz` : line))
    .join("\n");
}

function sh(script, cwd) {
  const result = spawnSync("sh", ["-c", script], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${script}\n${result.stderr}`);
  return result.stdout.trim();
}

test("instantiating over an approved product root preserves its durable context", () => {
  const scratch = mkdtempSync(join(tmpdir(), "plus-ultra-instantiate-"));
  try {
    // A stand-in for the template tarball: GitHub wraps the tree in one directory,
    // which is what `--strip-components=1` removes.
    const staging = join(scratch, "staging", "plus-ultra-template-abc1234");
    mkdirSync(join(staging, "apps", "web", "src"), { recursive: true });
    writeFileSync(join(staging, "README.md"), "# Plus Ultra Template\n");
    writeFileSync(join(staging, "package.json"), '{ "name": "plus-ultra-template" }\n');
    writeFileSync(join(staging, ".gitignore"), "node_modules/\n/.context/\n");
    writeFileSync(join(staging, "apps", "web", "src", "app.tsx"), "export const App = () => null;\n");
    const fixture = join(scratch, "template.tar.gz");
    sh(`tar -czf ${fixture} plus-ultra-template-abc1234`, join(scratch, "staging"));

    // The product root as step 1 and step 2 leave it: approved, durable, non-empty.
    const root = join(scratch, "product");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "product.md"), "# Product brief\n");
    writeFileSync(join(root, "DESIGN.md"), "# Design brief\n");

    sh(instantiationScript(fixture), root);

    // The approved context survives instantiation byte for byte.
    assert.equal(readFileSync(join(root, "docs", "product.md"), "utf8"), "# Product brief\n");
    assert.equal(readFileSync(join(root, "DESIGN.md"), "utf8"), "# Design brief\n");

    // The template's tracked files, including dotfiles and nested paths, land at the root.
    for (const path of ["README.md", "package.json", ".gitignore", "apps/web/src/app.tsx"]) {
      assert.ok(existsSync(join(root, path)), `${path} must be materialized into the product root`);
    }

    // The staging artifact is gone, and nothing needed a recursive force-delete.
    assert.ok(!existsSync(join(root, ".context", "template.tar.gz")));

    // A fresh history on a deterministic branch, carrying no template commits.
    assert.equal(sh("git -C . symbolic-ref --short HEAD", root), "main");
    assert.equal(sh("git -C . rev-list --count --all", root), "0", "no template commits may survive");
    assert.equal(sh("git -C . remote", root), "", "the template must not remain a remote");

    sh("git add -A && git -c user.email=t@example.com -c user.name=Test commit -q -m 'chore: initial'", root);
    assert.equal(sh("git -C . rev-list --count HEAD", root), "1", "the project starts at one local commit");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("Plus Ultra does not duplicate the stack the template owns", () => {
  const reference = read("skills/new-project/references/canonical-template.md");
  assert.match(
    reference,
    /\*\*The template repository is the source of truth for the stack\.\*\*/,
    "the reference must delegate the stack to the template"
  );
  assert.match(
    reference,
    /Never restate its dependencies,\nversions, package manager, tool choices, or file layout/
  );

  // A conceptual description is allowed; a dependency or version matrix is not.
  for (const path of ["skills/new-project/SKILL.md", "skills/new-project/references/canonical-template.md"]) {
    const content = read(path);
    assert.doesNotMatch(content, /\d+\.\d+\.\d+/, `${path} must not pin a version`);
    assert.doesNotMatch(content, /"dependencies"|package\.json|pnpm-lock|corepack/i, `${path} must not restate the manifest`);
  }
});

test("new-project approves a Technical Direction before initializing anything", () => {
  const raw = read("skills/new-project/SKILL.md");
  const skill = raw.replace(/\s+/g, " ");

  // The approval step sits between the fit judgment and initialization.
  const judge = raw.indexOf("## 3. Judge the canonical template");
  const approve = raw.indexOf("## 4. Approve the technical direction");
  const init = raw.indexOf("## 5. Initialize the repository");
  const verify = raw.indexOf("## 6. Verify, then stop before the remote");
  assert.ok(judge >= 0 && approve > judge && init > approve && verify > init, "steps must run judge → approve → init → verify");

  assert.ok(skill.includes("references/technical-direction.md"), "the detail stays in an on-demand reference");
  assert.ok(
    skill.includes("Create no file, run no init command, and install nothing until the human explicitly approves it"),
    "nothing is scaffolded before approval"
  );
  // The direct bootstrap path takes the same step.
  assert.ok(skill.includes("whatever the verdict, a direct bootstrap included"));
  assert.ok(skill.includes("Initialize exactly the approved direction"));
  assert.ok(skill.includes("Record the approved direction in `AGENTS.md`"), "the approved direction has a durable home");
  assert.ok(skill.includes("the approved direction and any deviation initialization required"), "the report names deviations");
});

test("the Technical Direction states the decision without re-litigating the template", () => {
  const reference = read("skills/new-project/references/technical-direction.md");
  const flat = reference.replace(/\s+/g, " ");

  // One explicit approval point a coordinating app can present on its own.
  assert.ok(flat.includes("one message that ends in one explicit approval question"));

  // AC2: what it states, in plain language and at the template reference's conceptual level.
  assert.ok(flat.includes("Short and in plain language"));
  assert.ok(flat.includes("**Template verdict.**"));
  assert.ok(flat.includes("fits, mostly fits, or does not fit"));
  assert.ok(flat.includes("**Direction.**"));
  assert.ok(flat.includes("persistence, and deployment target"));
  assert.ok(flat.includes("the conceptual level `canonical-template.md` uses"));
  assert.ok(flat.includes("**Alternatives.**"));
  assert.ok(flat.includes("Only where a real alternative exists"));
  assert.ok(flat.includes("**Deliberately left out.**"));

  // AC3: a fit approves the template itself; it is never an opt-in or a walkthrough.
  assert.ok(flat.includes("For a fit, the template is the decision being approved"));
  assert.ok(flat.includes("Do not ask whether to use it, and do not walk through what it owns"));

  // AC4: explicit human requirements are settled, never asked again.
  assert.ok(flat.includes("**Settled by you.**"));
  assert.ok(flat.includes("appear as settled and are not asked again"));

  // AC5: approval, revision, and refusal.
  assert.ok(flat.includes("Only explicit approval of the displayed proposal starts initialization"));
  assert.ok(flat.includes("show the complete revised proposal, and ask again"));
  assert.ok(flat.includes("A declined or unanswered proposal leaves the root without scaffolding"));

  // AC6: a durable home that is not the product brief.
  assert.ok(flat.includes("## Technical direction` section in the generated `AGENTS.md`"));
  assert.ok(flat.includes("Never put it in `docs/product.md`"));

  // AC7: the report and first commit reflect it, and deviations are named.
  assert.ok(flat.includes("The final report and the first commit reflect the approved direction"));
  assert.ok(flat.includes("Name every deviation initialization required"));
  assert.ok(flat.includes("present a revised direction for approval before continuing"));

  // AC8: the direct bootstrap takes the same step.
  assert.ok(flat.includes("A direct bootstrap takes the same step"));

  // The template stays the source of truth for its stack.
  assert.ok(flat.includes("Never restate the template's dependencies, versions, tools, or layout"));
  assert.doesNotMatch(reference, /\d+\.\d+\.\d+/, "the proposal must not pin a version");
  assert.doesNotMatch(reference, /"dependencies"|package\.json|pnpm|corepack/i, "the proposal must not restate a manifest");

  // Instantiation itself waits for the approval.
  const template = read("skills/new-project/references/canonical-template.md").replace(/\s+/g, " ");
  assert.ok(template.includes("Run this only after the human approves the Technical Direction"));

  const command = read("commands/new-project.md").replace(/\s+/g, " ");
  assert.ok(command.includes("wait for explicit approval of the Technical Direction before initializing"));
});

test("verification matches the baseline that was actually created", () => {
  const skill = read("skills/new-project/SKILL.md").replace(/\s+/g, " ");
  assert.ok(
    skill.includes("Install dependencies, then run every verification script the project exposes"),
    "install always runs, and so does everything the project defines"
  );
  assert.ok(
    skill.includes("On the canonical template that is `typecheck`, `test`, `lint`, and `build`"),
    "the template path must run all four"
  );
  assert.ok(
    skill.includes("a direct bootstrap runs whichever of those its own baseline actually defines"),
    "a bootstrap must not be assumed to expose all four scripts"
  );
  assert.ok(skill.includes("Fix what fails first. Make the first commit locally."));
  assert.ok(
    skill.includes("whether the template was used, adapted, or skipped and why"),
    "the report must state which path was taken"
  );
});

test("the recommended instantiation commands survive Plus Ultra's own guardrails", () => {
  const reference = read("skills/new-project/references/canonical-template.md");
  const block = reference.match(/```sh\n([\s\S]*?)```/);
  assert.ok(block, "the reference must show the instantiation commands");

  const commands = block[1].split("\n").map((line) => line.trim()).filter(Boolean);
  assert.ok(commands.length > 0);

  for (const command of commands) {
    const decision = hookDecision("dangerous-command.mjs", command);
    assert.notEqual(
      decision?.hookSpecificOutput?.permissionDecision,
      "deny",
      `plus-ultra blocks its own instruction: ${command}`
    );
  }

  // The shape the hook does deny, proving the check above is not vacuous.
  assert.equal(
    hookDecision("dangerous-command.mjs", "rm -rf ./project/.git")?.hookSpecificOutput?.permissionDecision,
    "deny"
  );

  // The shape the hook denies must not come back by another spelling.
  assert.doesNotMatch(reference, /rm\s+-\w*[rf]/, "the procedure must never need a recursive force-delete");
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

test("implementation stacks on an open design pull request", () => {
  const implement = read("skills/implement-issue/SKILL.md");
  assert.match(implement, /references\/stacking\.md/, "implement-issue must point to the stacking reference");

  const stacking = read("skills/implement-issue/references/stacking.md").replace(/\s+/g, " ");
  // Only an open design pull request triggers a stack; merged and closed ones do not.
  assert.match(stacking, /gh pr view <number> --json state,headRefName/);
  assert.match(stacking, /\*\*Merged:\*\* branch from the default branch/);
  assert.match(stacking, /\*\*Closed without merging:\*\* stop/);
  // The implementation branch starts from the design branch and the PR bases on it.
  assert.match(stacking, /git switch -c <branch> origin\/<headRefName>/);
  assert.match(stacking, /gh pr create --base <headRefName>/);
  assert.match(stacking, /gh stack link <design-pr> <implementation-pr>/);
  // Stacking by base still happens when the extension or repository support is missing.
  assert.match(stacking, /stacked by base branch only/);
  // The template body survives: no auto-generated submit, no local stack state.
  assert.match(stacking, /Do not use `gh stack submit`/);
  // Integration stays human, bottom of the stack first.
  assert.match(stacking, /merge the design pull request first/);
  assert.doesNotMatch(stacking, /gh stack merge/);

  // Refinement names the design pull request so detection is mechanical.
  const design = read("skills/refine-issue/references/feature-design.md").replace(/\s+/g, " ");
  assert.match(design, /naming the design pull request by number/);

  // The extension is optional, never a requirement.
  const conventions = read("skills/conventions/SKILL.md").replace(/\s+/g, " ");
  assert.match(conventions, /`gh stack` extension is optional/);
});

test("the first roadmap of a UI product proposes one UI journey", () => {
  const roadmap = read("skills/roadmap/SKILL.md").replace(/\s+/g, " ");
  assert.ok(
    roadmap.includes("[`references/journey-design.md`](./references/journey-design.md)"),
    "roadmap must point to the on-demand journey reference"
  );
  assert.ok(roadmap.includes("root `DESIGN.md` and no `designs/journey.html`"));
  // The no-DESIGN.md path must be reachable without loading the reference.
  assert.match(roadmap, /Without a `DESIGN\.md`, propose none/);
  assert.match(roadmap, /needs an approved `DESIGN\.md` first/);

  const journey = read("skills/roadmap/references/journey-design.md").replace(/\s+/g, " ");
  // Only a product with an approved DESIGN.md and no journey yet gets one.
  assert.ok(journey.includes("root `DESIGN.md` and no `designs/journey.html`"));
  // What the journey holds, and at which fidelity.
  for (const part of ["navigation map", "key screen", "main flows", "shared components"]) {
    assert.ok(journey.includes(part), `the journey must show ${part}`);
  }
  assert.match(journey, /own `<section>` with a stable `id`/);
  assert.match(journey, /names the Stories that build it/);
  assert.match(journey, /A UI Story is one that builds at least one screen or flow/);
  assert.match(journey, /mid fidelity/i);
  assert.match(journey, /loading, error, and empty states/i);
  // It reuses the feature-design rules instead of restating them.
  assert.ok(journey.includes("(../../refine-issue/references/feature-design.md)"));
  assert.match(journey, /Construct and Validate/);
  assert.match(journey, /structural and the visual audit/);
  assert.match(journey, /one self-contained HTML file/);
  assert.match(journey, /`DESIGN\.md` tokens as CSS custom properties/);
  // One approval covers the tree and the journey; then links, commit, and a pull request.
  assert.match(journey, /names the journey's feature branch, its commit, and its pull request/);
  assert.match(journey, /One explicit approval covers/);
  assert.match(journey, /shown again before any write/);
  assert.match(journey, /Replace the Story titles the journey names with the created Issue numbers/);
  assert.match(journey, /Report its URL/);
  assert.ok(journey.includes("`designs/journey.html#<id>`"));
  assert.match(journey, /feature branch/);
  assert.match(journey, /pull request against the default branch/);
  assert.match(journey, /waits for that pull request to merge/);
  assert.match(journey, /never merge/i);
  for (const machinery of ["renderer", "generator", "component library", "manifest", "versioning"]) {
    assert.match(journey, new RegExp(`Do not add .*${machinery}`, "i"));
  }

  // Screens live in the journey, not in DESIGN.md.
  const brief = read("skills/new-project/references/design-brief.md").replace(/\s+/g, " ");
  assert.match(brief, /Screens belong in the UI journey at `designs\/journey\.html`/);

  const conventions = read("skills/conventions/SKILL.md");
  assert.match(
    conventions,
    /^\| UI journey, for a product with a UI \| `designs\/journey\.html` \| yes \|$/m,
    "the artifact table must place the journey and commit it"
  );
});

test("a Story's design starts from the UI journey when one exists", () => {
  const design = read("skills/refine-issue/references/feature-design.md").replace(/\s+/g, " ");
  // Read the Story's journey sections, and the designs of Stories that share them, before designing.
  assert.ok(design.includes("`designs/journey.html`"));
  assert.match(design, /sections the Story links to/);
  assert.match(design, /sections that name the Story/);
  assert.match(design, /approved designs of the other Stories those sections name/);
  // A journey that has not reached the default branch stops refinement before any write.
  assert.match(design, /not on the default branch/);
  assert.match(design, /stop before proposing/);
  assert.match(design, /make no GitHub write/);
  assert.match(design, /journey's pull request must merge first/);
  // Keep the journey, add what it leaves out, and name every departure.
  assert.match(design, /Keep the journey's navigation, flows, and shared components/);
  assert.match(design, /loading, error, and empty states/);
  assert.match(design, /List every departure from the journey, with its reason/);
  // Shared-pattern departures update the journey in the same design pull request; local ones do not.
  assert.match(design, /same design pull request updates the journey's affected sections/);
  assert.match(design, /departure local to the Story leaves the journey as it is/);
  // The journey never replaces the Story's own design.
  assert.match(design, /journey section alone is never the Story's approved reference/);
  assert.match(design, /Without a journey, design from `DESIGN\.md` as below/);

  // Refinement's always-loaded skill is unchanged by the journey.
  assert.doesNotMatch(read("skills/refine-issue/SKILL.md"), /journey/);
});

test("a product already underway can get a UI journey from what exists", () => {
  const roadmap = read("skills/roadmap/SKILL.md").replace(/\s+/g, " ");
  assert.match(roadmap, /already underway/, "roadmap must route an existing product to the journey reference");

  const journey = read("skills/roadmap/references/journey-design.md").replace(/\s+/g, " ");
  assert.match(journey, /## A product already underway/);
  // The existing tree, without new Epics or Stories unless the human asks.
  assert.match(journey, /existing Epics or Stories/);
  assert.match(journey, /no new Epics or Stories unless the human asks/);
  // Approved designs are the source and are never redesigned or edited.
  assert.ok(journey.includes("approved `designs/<issue>-<slug>.html`"));
  assert.match(journey, /names the design it comes from/);
  assert.match(journey, /never redesign or edit/i);
  // Shipped screens without an HTML design are reconstructed and marked.
  assert.match(journey, /marked as reconstructed/);
  assert.match(journey, /Do not read or run the product's code/);
  // Open Stories without a design match the existing screens.
  assert.match(journey, /designed to match the existing screens/);
  // Conflicts between approved designs are the human's choice.
  assert.match(journey, /lists each conflict with a recommended resolution/);
  // Screen prose leaves DESIGN.md through the same approval and pull request.
  assert.match(journey, /smallest `DESIGN\.md` change that removes them/);
  assert.match(journey, /same feature branch and pull request/);
  // Open Stories get their links by an approved edit.
  assert.match(journey, /edit each open UI Story's body to add a link/);
});
