# plus-ultra

A reproducible, installable Claude Code harness for **solo, spec-driven development** in Node/TS,
with specs kept as markdown in the repo.

It does **not** reinvent a methodology. It depends on [Superpowers](https://github.com/obra/superpowers)
for the core loop — brainstorming → writing-plans → git-worktree isolation → subagent-driven TDD →
systematic debugging → verification-before-completion → PR — and layers thin, project-specific
conventions and guardrails on top.

## Install

```
/plugin marketplace add maurocicerchia/plus-ultra
/plugin install plus-ultra@plus-ultra
```

Superpowers is declared as a dependency and installed automatically from the same marketplace.

## What it adds

- **Skills (portable, `plus-ultra:*` when installed as a plugin):**
  - *spec-conventions* — `specs/NNN-slug.md` numbering + a spec template (Problem, Goals/Non-goals,
    Acceptance criteria, Interface contracts, Data model, Test plan, Risks) with a `status:` lifecycle
    (draft → approved → in-progress → done). Plus `docs/` layout and an ADR template.
  - *spec* — portable equivalent of `/plus-ultra:spec`: list specs, create the next-numbered spec,
    or flip a spec's status.
  - *tech-stack* — the default stack: a TypeScript-everywhere **pnpm-workspaces monorepo** —
    React + Vite (web), Hono (api), shared zod/types, Drizzle + Neon, vitest, Biome. Defaults, with
    a stated escape hatch per row.
  - *conventional-commits* — the commit message format (enforced by the commit-msg-lint hook).
  - *pull-request-descriptions* — drafts reviewer-focused PR bodies that connect context, summary,
    testing, risks, and review guidance.
  - *new-project* — scaffolds the tech-stack monorepo + CI.
  - *repo-explorer*, *code-reviewer*, *dep-auditor* — portable skill equivalents of the Claude
    subagents.
- **Slash command:** `/plus-ultra:spec` — list specs, create the next-numbered spec, or flip a
  spec's status. Claude Code only; Codex uses the `plus-ultra:spec` skill instead.
- **Guardrail hooks:**
  - *dangerous-command* (PreToolUse / Bash) — blocks `rm -rf` and force-pushes to `main`/`master`.
  - *secret-scan* (PreToolUse / `git commit`) — blocks a commit whose staged diff contains a
    private key, cloud/API token, or a staged `.env` file.
  - *commit-msg-lint* (PreToolUse / `git commit -m`) — blocks a header that isn't a Conventional Commit.
  - *commit-gate* (PreToolUse / `git commit`) — blocks unless a test run passed this session (and, in
    a TypeScript project, a typecheck). Order is flexible: checks any time in the session.
  - *test-marker* (PostToolUse / Bash) — records a per-session marker when a test or typecheck exits 0.
  - *auto-format* (PostToolUse / Write|Edit/apply_patch) — runs `biome check --write` on edited
    JS/TS/JSON files anywhere in the repo (no-ops if Biome is absent).
  - *session-start* — reports which spec is `in-progress` (and what's approved/draft) so sessions
    resume without re-explaining context.
- **Subagents:** `repo-explorer` (read-only scan), `code-reviewer` (diff vs the spec's acceptance
  criteria), `dep-auditor` (vet new npm packages).
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
environment. Cursor ships skills only.

The slash command in `commands/` and Markdown subagents in `agents/` remain Claude Code formats.
Codex gets equivalent behavior through the portable `spec`, `repo-explorer`, `code-reviewer`, and
`dep-auditor` skills.

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
                                 conventional-commits, pull-request-descriptions,
                                 new-project, repo-explorer, code-reviewer, dep-auditor) —
                                 shared by all agents
commands/spec.md                 /plus-ultra:spec lifecycle command — Claude only
agents/                          repo-explorer, code-reviewer, dep-auditor — Claude only
hooks/                           hooks.json, hooks-codex.json + *.mjs
```
