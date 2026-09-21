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
const SUPPORTING = ["conventions", "integration-boundary", "pencil-design"];
const SKILLS = [...CAPABILITIES, ...SUPPORTING];

test("the plugin ships exactly the reboot skill set", () => {
  const present = listDir("skills")
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(present, [...SKILLS].sort());

  const maintainer = read("docs/maintainer-guide.md").replace(/\s+/g, " ");
  assert.ok(
    maintainer.includes("three they share (`conventions`, `integration-boundary`, `pencil-design`)"),
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
  assert.match(skill, /references\/code-review\.md/);
  assert.match(skill, /plus-ultra:integration-boundary/);
  assert.match(skill, /ready for review\*\* and stop/);

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
  assert.match(flat, /\*\*Ask the human\*\* on a new material ambiguity/);
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

test("an approved design becomes durable before implementation depends on it", () => {
  const pencil = read("skills/pencil-design/SKILL.md").replace(/\s+/g, " ");

  // build → validate → one approval → save → Git → Issue → unblocked.
  assert.ok(
    pencil.includes(
      "Then hand off in this order: present the refined Issue proposal and the validated design " +
        "together"
    )
  );
  assert.match(pencil, /one explicit human approval covers both/);
  assert.match(pencil, /save the approved artifact at `designs\/<issue>-<slug>\.pen`/);
  assert.match(pencil, /persist it through the repository's normal Git workflow/);
  assert.match(pencil, /record its path and Git reference in the Issue/i);
  assert.match(pencil, /is implementation unblocked on the design artifact/);

  // A temporary marker is allowed until the real reference exists.
  assert.match(pencil, /`Approved design pending durable Git reference\.`/);
  assert.match(pencil, /until the real path replaces it/);

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

  // Still eight skills; the reference must not become one.
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

test("Pencil preflight is agent-owned and only escalates when it cannot act", () => {
  const pencil = read("skills/pencil-design/SKILL.md");
  const flat = pencil.replace(/\s+/g, " ");
  assert.match(pencil, /creating, editing, validating, or consuming/i);
  assert.match(pencil, /application is named `Pen`/);
  assert.match(pencil, /active document.*before.*Pencil MCP/is);
  assert.match(pencil, /read_skill/);
  assert.match(pencil, /get_app_state/);
  for (const nativeDoc of ["skill", "schema", "execute", "UI guide"]) {
    assert.match(pencil, new RegExp(nativeDoc, "i"));
  }
  assert.match(pencil, /Never (?:read|inspect).*\.pen.*ordinary filesystem/is);

  // The agent opens Pen and the document itself; a closed app is not a reason to stop.
  assert.match(flat, /Own this yourself/);
  assert.match(flat, /launch Pen when it is closed/);
  assert.match(flat, /create a blank document in Pen for a new design/);
  assert.match(flat, /open that exact file in Pen for an existing repository `\.pen`/);
  assert.match(flat, /local UI or OS automation/);

  // The human is asked only when the environment genuinely cannot do it safely.
  assert.match(flat, /Ask the human only when you cannot do that safely/);
  assert.match(flat, /no such automation, blocked permissions, or an undeterminable target/);
  assert.match(flat, /Never interrupt merely because Pen is closed or has no document open/);

  // Compatibility, not a wrapper: no persistent automation layer around Pen.
  assert.doesNotMatch(pencil, /GUI orchestration|automation framework|automation layer/i);

  // It remains a helper rather than a sixth user-facing capability.
  assert.ok(!existsSync(join(repoRoot, "commands/pencil-design.md")));
  assert.ok(!existsSync(join(repoRoot, "skills/pencil-design/agents/openai.yaml")));
});

test("Pencil construction preserves the product and feature design boundary", () => {
  const pencil = read("skills/pencil-design/SKILL.md");
  const flat = pencil.replace(/\s+/g, " ");
  assert.ok(flat.includes("`DESIGN.md` is the approved product-level visual direction"));
  assert.ok(flat.includes("a `.pen` becomes the approved feature-level reference after human approval"));
  assert.ok(flat.includes("`designs/<issue>-<slug>.pen`"));
  assert.match(pencil, /map.*`DESIGN\.md`.*tokens.*Pencil variables/is);
  assert.match(pencil, /named top-level frames/i);
  assert.match(pencil, /human-readable names/i);
  assert.match(pencil, /`placeholder: true` only while actively constructing/i);
  assert.match(pencil, /flex|dynamic layout/i);
  assert.match(pencil, /focused `execute` calls/i);
  assert.match(pencil, /fix completed nodes directly/i);
});

test("Pencil compatibility notes encode the proven reliable sequences", () => {
  const pencil = read("skills/pencil-design/SKILL.md");
  const flat = pencil.replace(/\s+/g, " ");
  assert.match(pencil, /After a meaningful mutation/);
  assert.match(pencil, /inspect structure.*with `Get`/is);
  assert.match(pencil, /separate `execute` call.*screenshot/is);
  assert.match(pencil, /blank or stale screenshot/i);
  assert.match(pencil, /After `Copy`/);
  assert.match(pencil, /rediscover.*new IDs/is);
  assert.match(pencil, /descendant-name overrides/i);
  assert.ok(flat.includes("Save repository designs using the basename without `.pen`"));
  assert.match(pencil, /repository-relative path.*without the extension/i);
  assert.match(pencil, /appends `\.pen`/);
  assert.ok(flat.includes("Reopen the saved repository path explicitly"));
});

test("Pencil approval requires structural, visual, and durable evidence", () => {
  const pencil = read("skills/pencil-design/SKILL.md");
  const flat = pencil.replace(/\s+/g, " ");
  for (const evidence of [
    "no remaining `placeholder: true`",
    "no reported `ctx.problems`",
    "expected top-level frames",
    "sensible bounds",
    "screenshot every relevant screen",
    "responsive behavior",
    "validation and success states",
  ]) {
    assert.ok(flat.includes(evidence), `Pencil validation must require ${evidence}`);
  }
  assert.match(pencil, /Neither.*replaces the other/is);
  assert.match(pencil, /durably reachable through Git/i);
  assert.match(pencil, /implementation worktree/i);
  assert.match(flat, /unintegrated.*blocked/i);
  assert.match(flat, /record its path and Git reference in the Issue/i);
  assert.match(pencil, /no .*parser|Do not add .*parser/i);
  assert.match(pencil, /wrapper API|wrapper/i);
  assert.match(pencil, /manifest/i);
  assert.match(pencil, /versioning/i);
});

test("refinement prefers Pencil and implementation consumes approved .pen designs", () => {
  const refine = read("skills/refine-issue/SKILL.md").replace(/\s+/g, " ");
  assert.ok(refine.includes("read root `DESIGN.md`"));
  assert.ok(refine.includes("`plus-ultra:pencil-design`"));
  assert.match(refine, /Pencil.*preferred/i);
  assert.match(refine, /mockup, screenshot, or described reference.*fallback/i);
  assert.ok(refine.includes("`designs/<issue>-<slug>.pen`"));
  assert.match(refine, /explicit human approval/i);
  assert.match(refine, /durably reachable through Git/i);

  const implement = read("skills/implement-issue/SKILL.md").replace(/\s+/g, " ");
  assert.match(implement, /Design.*\.pen/i);
  assert.ok(implement.includes("`plus-ultra:pencil-design`"));
  assert.match(implement, /approved feature-level/i);
  assert.match(implement, /do not redesign/i);
  assert.match(implement, /ordinary filesystem tools/i);
  assert.match(implement, /`DESIGN\.md`.*product-level/i);

  const depth = read("skills/implement-issue/references/depth.md").replace(/\s+/g, " ");
  assert.ok(depth.includes("Pencil uses `designs/<issue>-<slug>.pen`"));
  assert.ok(depth.includes("present in the later implementation worktree"));
  assert.ok(!depth.includes("`designs/<issue>-<slug>.pen` committed with the change"));
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
