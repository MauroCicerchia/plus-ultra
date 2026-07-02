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

- **`plus-ultra:spec-conventions` skill** — `specs/NNN-slug.md` numbering + a spec template
  (Problem, Goals/Non-goals, Acceptance criteria, Interface contracts, Data model, Test plan, Risks)
  with a `status:` lifecycle (draft → approved → in-progress → done). Plus `docs/` layout for
  architecture notes, ADRs, and the changelog.
- **Guardrail hooks:**
  - *commit-gate* (PreToolUse / `git commit`) — blocks a commit unless a test run passed this
    session. Order is flexible: tests any time in the session, not necessarily before writing code.
  - *dangerous-command* (PreToolUse / Bash) — blocks `rm -rf` and force-pushes to `main`/`master`.
  - *test-marker* (PostToolUse / Bash) — records a per-session marker when a test command exits 0.
  - *auto-format* (PostToolUse / Write|Edit) — runs `eslint --fix` + `prettier --write` on edited
    files under `src/**` (no-ops if tooling is absent).
  - *session-start* — reports which spec is `in-progress` (and what's approved/draft) so sessions
    resume without re-explaining context.
- **Subagents:** `repo-explorer` (read-only scan), `code-reviewer` (diff vs the spec's acceptance
  criteria), `dep-auditor` (vet new npm packages).
- **MCP:** remote GitHub MCP server (`https://api.githubcopilot.com/mcp/`). Authorize it once via
  `/mcp` (OAuth) in an interactive session.

## Naming

Superpowers owns generic skill names (`brainstorming`, `writing-plans`, …). Everything plus-ultra
adds is namespaced (`plus-ultra:spec-conventions`, the `plus-ultra:*` subagents, etc.) so ownership
is unambiguous.

## Multi-agent

Structured skills-first, like Superpowers: the repo root is the plugin for every agent, and each
agent's manifest points at the one shared `skills/` dir. The `spec-conventions` skill (and its
template) therefore works on Claude Code, Codex, Cursor, and any agent that reads `skills/`.

Guardrail hooks and review subagents are **Claude Code only** — they rely on Claude's hook system
(`PreToolUse`/`PostToolUse`/`SessionStart`) and subagent format, which other agents don't share. The
Codex/Cursor manifests ship skills only (`hooks: {}`). To add another agent, drop in its
`.<agent>-plugin/plugin.json` with `"skills": "./skills/"`.

## Hook scripts

Hooks are dependency-free Node ESM scripts under `hooks/`. They read the hook JSON from stdin and
(for PreToolUse) block by emitting a `permissionDecision: "deny"` decision. Set
`PLUS_ULTRA_HOOK_DEBUG=1` to dump raw hook payloads to stderr while developing.

## Layout

```
.claude-plugin/marketplace.json  marketplace: superpowers + plus-ultra (source ./)
.claude-plugin/plugin.json       Claude manifest; dependencies: ["superpowers"]
.codex-plugin/plugin.json        Codex manifest (skills only)
.cursor-plugin/plugin.json       Cursor manifest (skills only)
.agents/plugins/marketplace.json open-agents marketplace entry
skills/spec-conventions/         SKILL.md + template.md — shared by all agents
agents/                          repo-explorer, code-reviewer, dep-auditor — Claude only
hooks/                           hooks.json + *.mjs — Claude only
mcp/github.json                  remote GitHub MCP — Claude
```
