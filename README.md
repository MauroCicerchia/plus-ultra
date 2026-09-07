# plus-ultra

A reproducible, installable Claude Code harness for **solo, spec-driven development** in Node/TS,
with specs kept as markdown in the repo.

It does **not** reinvent a methodology. It depends on [Superpowers](https://github.com/obra/superpowers)
for the core loop — brainstorming → writing-plans → git-worktree isolation → subagent-driven TDD →
systematic debugging → verification-before-completion → PR — and layers thin, project-specific
conventions and guardrails on top.

## Install

### Codex

```
codex plugin marketplace add maurocicerchia/plus-ultra --ref main
codex plugin add plus-ultra@plus-ultra
```

To update, run `codex plugin marketplace upgrade plus-ultra`, then run
`codex plugin add plus-ultra@plus-ultra` again.

### Claude Code

```
claude plugin marketplace add maurocicerchia/plus-ultra
claude plugin add plus-ultra@plus-ultra
```

To update, run `claude plugin marketplace update plus-ultra`, then
`claude plugin update plus-ultra@plus-ultra`.

### Cursor

Refresh or reinstall Plus Ultra from the Cursor marketplace. Cursor has no documented CLI command
for this workflow, so the marketplace UI remains the supported path.

Superpowers is declared as a dependency and installed automatically from the same marketplace.

### Local Codex dogfooding

To exercise an unreleased working tree without changing its versioned manifests, run:

```
node scripts/codex-local.mjs refresh
```

It installs a temporary `plus-ultra-dev` marketplace from `.context/`. Open a new Codex thread
afterward so the local plugin is loaded. Return to the released plugin with:

```
node scripts/codex-local.mjs restore
```

## Quick start

After installation, tell your coding agent which path you are taking. Superpowers supplies the core
methodology; `plus-ultra` adds the repository conventions, stack defaults, and guardrails.

### Start a new project

```text
Use the plus-ultra:new-project skill to scaffold a new project for [describe the product]. Then use
plus-ultra:spec-conventions to keep workflow artifacts local before using Superpowers to brainstorm
the first feature, write its implementation plan, implement it with TDD, and verify the result.
```

### Use an existing repository

```text
In this repository, first use plus-ultra:spec-conventions to configure workflow artifact locations
and ignore rules. Then use Superpowers to brainstorm [describe the change]. After I approve the
design, use plus-ultra:spec to create and manage the repository spec, write the implementation
plan, implement it with TDD, verify the result, and prepare the pull request.
```

## Optional companions

`plus-ultra` stays focused on spec-driven development. For day-to-day projects, it pairs well with
generic skills and MCPs that are intentionally not bundled as dependencies:

- **`frontend-design`** — use for visual direction, layout, typography, and UI polish when a project
  has a user-facing surface.
- **`shadcn` / shadcn MCP** — use for shadcn/ui component discovery, docs, examples, and registry
  operations.
- **`gh-cli`** — use with the `gh` CLI for issues, pull requests, Actions, releases, and repo
  operations.
- **Neon skills / MCPs** — use when a project adopts the default Neon Postgres path from
  `plus-ultra:tech-stack`.
- **`vercel-react-best-practices`** — use for React and Next.js implementation or review where
  rendering, data fetching, bundle size, or runtime performance matters.
- **`vercel-composition-patterns`** — use when designing reusable React component APIs or refactoring
  components overloaded with boolean props.
- **`vitest`** — use for Vitest-specific test design, mocking, configuration, debugging, and suite
  reliability.
- **`playwright-best-practices`** — use when a project has selected Playwright for browser E2E
  coverage and needs reliable locators, isolation, fixtures, or CI guidance.

`plus-ultra:new-project` treats these as companion capabilities: use them when available, note when
they are missing, and continue with plain CLI/docs when the project can still be scaffolded safely.
They do not replace Superpowers' workflow or `plus-ultra`'s architecture defaults, and they are not
installed automatically.

Install any of the quality companions you want with the skills CLI:

```sh
npx skills add vercel-labs/agent-skills@vercel-react-best-practices
npx skills add vercel-labs/agent-skills@vercel-composition-patterns
npx skills add pproenca/dot-skills@vitest
npx skills add currents-dev/playwright-best-practices-skill@playwright-best-practices
```

## GitHub Issue workflows

Use GitHub Issues as the source of truth for product work: a **milestone** represents a release or
roadmap horizon, an **epic** is an issue labelled `type:epic`, and a **story** is its executable
sub-issue labelled `type:story`. The workflow uses `status:backlog`, `status:ready`,
`status:in-progress`, and `status:blocked`; closing an issue represents completion. Milestone
progress aggregates the assigned work, while epic progress comes from its sub-issues.

The portable workflows are:

- **`plus-ultra:issue-management`** — report the hierarchy and progress, or propose milestones,
  epics, stories, labels, and parent-child links.
- **`plus-ultra:refine-issues`** — turn a raw person-created issue into a proposed structured brief:
  `Context`, `Goal`, `Scope`, acceptance criteria, dependencies, and risks.
- **`plus-ultra:roadmap-planning`** — turn a roadmap brief or issue into a proposed milestone →
  epic → story tree.

Claude Code also offers `/plus-ultra:issue-management`, `/plus-ultra:refine-issues <issue-number>`,
and `/plus-ultra:roadmap-planning <brief | issue-number>`. Every GitHub write requires authenticated
`gh` access with repository write permission, a complete preview of the exact mutations, and an
explicit confirmation in that execution. These workflows intentionally use neither GitHub Projects
nor a bundled GitHub MCP.

Issue hierarchy uses native `gh issue` operations on GitHub CLI v2.94.0 and later. On older
installations, GraphQL is a fallback only for the missing hierarchy operation.

## Human integration boundary

Plans, specs, Issues, and earlier messages never authorize merging or publishing. Implementation
agents may edit, verify, commit, push a feature branch, create or update a pull request, and submit
or update a stack. They must report the PR or stack as ready for integration (or ready for review)
and stop.

Agents must not autonomously merge, enable auto-merge, push to the default branch, create or
publish a release, or create or publish a tag; equivalent GitHub API and GraphQL mutations are also
out of bounds. A plan can describe these as a future manual rollout under `## Post-approval
integration`, outside an executable checklist, but that wording is not authorization.

`plus-ultra:integration-boundary` is the portable policy skill for finishing implementation and
handling merges, releases, tags, or protected pushes. Claude Code and Codex support lifecycle-hook
guardrails for recognized integration commands. Cursor ships the portable skill only, so this is
documentation-only there; the policy is a cooperative-agent safety boundary, not a security
sandbox. There is no `plus-ultra:integrate` command.

## What it adds

- **Skills (portable, `plus-ultra:*` when installed as a plugin):**
  - *spec-conventions* — `specs/NNN-slug.md` numbering + optional GitHub Issue frontmatter and a
    spec template (Problem, Goals/Non-goals,
    Acceptance criteria, Interface contracts, Architecture boundaries, Functional core, Data model,
    Test plan, Risks) with a `status:` lifecycle (draft → approved → superseded). Plus
    `docs/` layout and an ADR template.
  - *spec* — portable equivalent of `/plus-ultra:spec`: list specs, create the next-numbered spec,
    or flip a spec's status.
  - *tech-stack* — the default stack: a TypeScript-everywhere **pnpm-workspaces monorepo** —
    React + Vite (web), Hono (api), shared zod/types, Drizzle + Neon, vitest, Biome. Defaults, with
    a stated escape hatch per row.
  - *engineering-principles* — default guidance for hexagonal architecture and functional programming
    where applicable: domain/application boundaries, ports/adapters, pure functions,
    immutable data, explicit error values, and side-effect isolation.
  - *conventional-commits* — the commit message format (enforced by the commit-msg-lint hook).
  - *pull-request-descriptions* — drafts reviewer-focused PR bodies with a human-first overview and
    conditional Mermaid diagrams, then connects context, Issue–Spec traceability, summary, testing,
    risks, and review guidance. `Refs #N` is the safe default; `Closes #N` is reserved for a
    verifiably complete `type:story` contract.
  - *pr-review* — reviews a GitHub pull request against its approved technical contract using the
    remote `headRefOid`: a unique `closingIssuesReferences` match first, then an explicit
    `--spec <NNN|slug>` fallback, strict branch association, and approved-spec discovery. Ambiguous
    branch or discovery results pause for a path/Issue selection before any write. With no approved
    spec, it can perform an explicitly accepted limited review (`Spec: none`; no contractual
    verdict). It posts deduplicated right-side findings and maintains a canonical, verdict-first
    tagged summary: a visible Ready, Changes required, or Limited review status before findings and
    compact traceability. It uses the current branch’s PR by default; pass a positive PR number and optionally
    `--spec <NNN|slug>` as a fallback. This workflow requires GitHub write access through `gh`.
  - *integration-boundary* — portable policy for ending autonomous work at ready for integration;
    manual merge and publication remain human-owned.
  - *workflow-risk* — portable FAST / STANDARD / CRITICAL classification contract. It records
    explainable initial and pre-ship recommendations without commands, hooks, or state: Issue #22
    owns future orchestration and persistence, Issue #26 owns conditional Semgrep execution, and
    Issue #35 exclusively owns UI classification. Significant UI impact prevents FAST but never
    creates a critical risk dimension.
  - *issue-management*, *refine-issues*, *roadmap-planning* — GitHub Issues workflows for native
    milestone → epic → story planning, raw issue refinement, and progress reporting. Remote writes
    are always proposal-first and confirmation-gated.
  - *new-project* — scaffolds the tech-stack monorepo + CI.
  - *repo-explorer*, *code-reviewer*, *dep-auditor* — portable skill equivalents of the Claude
    subagents.
- **Slash commands:** `/plus-ultra:spec` — list specs, create the next-numbered spec, or flip a
  spec's status; `/plus-ultra:pr-review [pr-number] [--spec <NNN|slug>]` — publish and maintain a
  spec-driven PR review; `/plus-ultra:issue-management`, `/plus-ultra:refine-issues <issue-number>`, and
  `/plus-ultra:roadmap-planning <brief | issue-number>` — manage GitHub Issue roadmaps. Claude Code
  only; Codex uses the corresponding portable skills instead.
- **Guardrail hooks:**
  - *dangerous-command* (PreToolUse / Bash) — blocks `rm -rf` and force-pushes to `main`/`master`.
  - *secret-scan* (PreToolUse / `git commit`) — blocks a commit whose staged diff contains a
    private key, cloud/API token, or a staged `.env` file.
  - *commit-msg-lint* (PreToolUse / `git commit -m`) — blocks a header that isn't a Conventional Commit.
  - *commit-gate* (PreToolUse / `git commit`) — blocks unless a test run passed for the current Git
    working tree this session (and, in a TypeScript project, a typecheck). Order is flexible: checks
    any time in the session, but code changes require rerunning them.
  - *test-marker* (PostToolUse / Bash) — records a per-session, Git-tree fingerprinted marker when a
    test or typecheck exits 0.
  - *pr-description-reminder* (PostToolUse / `git commit`) — reminds you to refresh an open PR
    description after new commits; it never edits GitHub state.
  - *auto-format* (PostToolUse / Write|Edit/apply_patch) — runs `biome check --write` on edited
    JS/TS/JSON files anywhere in the repo (no-ops if Biome is absent).
  - *session-start* — reports approved technical contracts (including a linked Issue #) and drafts
    so sessions resume without re-explaining context.
- **Subagents:** `repo-explorer` (read-only scan), `code-reviewer` (diff vs the spec's acceptance
  criteria), `pr-reviewer` (GitHub review publishing and maintenance), `issue-manager`,
  `issue-refiner`, `roadmap-planner` (confirmation-gated GitHub Issue workflows), and `dep-auditor`
  (vet new npm packages).
- **GitHub:** no bundled MCP — use the `gh` CLI (with the `gh-cli` skill) from the shell for PRs,
  issues, Actions, and releases.

## Naming

Superpowers owns generic skill names (`brainstorming`, `writing-plans`, …). Everything plus-ultra
adds is namespaced (`plus-ultra:spec-conventions`, the `plus-ultra:*` subagents, etc.) so ownership
is unambiguous.

## Multi-agent

Structured skills-first, like Superpowers: the repo root is the plugin for every agent, and each
agent's manifest points at the one shared `skills/` dir. The `spec-conventions` skill (and its
template) therefore works on Claude Code, Codex, Cursor, and any agent that reads `skills/`.

Codex ships the shared skills plus `hooks/hooks-codex.json`, which uses Codex's lifecycle hook
schema and `${PLUGIN_ROOT}`. Claude Code ships `hooks/hooks.json`, which uses Claude's plugin
environment. Claude Code and Codex can use lifecycle-hook guardrails for recognized integration
commands; Cursor ships the portable integration policy skill only and remains documentation-only.

The slash command in `commands/` and Markdown subagents in `agents/` remain Claude Code formats.
Codex gets equivalent behavior through the portable `spec`, `repo-explorer`, `code-reviewer`, and
`pr-review`, `issue-management`, `refine-issues`, `roadmap-planning`, and `dep-auditor` skills.

## Hook scripts

Hooks are dependency-free Node ESM scripts under `hooks/`. They read the hook JSON from stdin and
(for PreToolUse) block by emitting a `permissionDecision: "deny"` decision. Set
`PLUS_ULTRA_HOOK_DEBUG=1` to dump raw hook payloads to stderr while developing.

## Layout

```
.claude-plugin/marketplace.json  marketplace: superpowers + plus-ultra (source ./)
.claude-plugin/plugin.json       Claude manifest; dependencies: ["superpowers"]
.codex-plugin/plugin.json        Codex manifest (skills + Codex lifecycle hooks)
.cursor-plugin/plugin.json       Cursor manifest (skills only)
.agents/plugins/marketplace.json open-agents marketplace entry
skills/                          portable skills (spec-conventions, spec, tech-stack,
                                 engineering-principles, conventional-commits,
                                 pull-request-descriptions, new-project, repo-explorer,
                                 code-reviewer, pr-review, issue-management, refine-issues,
                                 roadmap-planning, dep-auditor) —
                                 shared by all agents
commands/                        /plus-ultra:spec, /plus-ultra:pr-review, and Issue workflows — Claude only
agents/                          repo-explorer, code-reviewer, pr-reviewer, Issue workflow agents,
                                 dep-auditor — Claude only
hooks/                           hooks.json, hooks-codex.json + *.mjs
```
