# Working in this repo

This repo **is** a Claude Code plugin (`plus-ultra`) plus its marketplace. It's a thin, opinionated
layer on top of [Superpowers](https://github.com/obra/superpowers); it does not reimplement that
methodology. End-user docs live in `README.md` — this file is for agents editing the plugin itself.

## Layout

Skills-first, like Superpowers: the repo root **is** the plugin for every agent. Each agent has its
own manifest, and they all point at the one shared `skills/` dir.

```
.claude-plugin/marketplace.json  lists superpowers (github) + plus-ultra (./)
.claude-plugin/plugin.json       Claude manifest; dependencies: ["superpowers"] (array, unpinned)
.codex-plugin/plugin.json        Codex manifest — skills + hooks/hooks-codex.json
.cursor-plugin/plugin.json       Cursor manifest — skills only
.agents/plugins/marketplace.json open-agents ("agents") marketplace entry
skills/                          portable markdown skills (SKILL.md + assets) — shared by ALL agents
commands/                        slash commands (*.md) — Claude only
agents/                          Claude Code subagents (*.md) — Claude only
hooks/                           hooks.json, hooks-codex.json + zero-dep Node ESM scripts
```

GitHub access is via the `gh` CLI (no bundled MCP).

## Conventions

- **Hooks are dependency-free Node ESM** (`.mjs`). Claude invokes them as
  `node ${CLAUDE_PLUGIN_ROOT}/hooks/…`; Codex invokes them as `node ${PLUGIN_ROOT}/hooks/…`.
  Shared stdin/decision helpers live in `hooks/_lib.mjs`. PreToolUse hooks block by emitting a
  `permissionDecision: "deny"` JSON decision (see `deny()`), never by throwing.
- **Fail open, never disrupt the session.** A hook that errors or hits missing tooling should exit 0
  (except deliberate deny paths). commit-gate/test-marker are the only intentional blockers.
- **Plugins are copied to a cache on install** → never reference `../` or files outside the plugin
  dir. Keep everything self-contained under `plus-ultra/`.
- **Namespacing:** Superpowers owns generic skill names (`brainstorming`, `writing-plans`, …).
  Everything plus-ultra adds is prefixed (`plus-ultra:spec-conventions`, the `plus-ultra:*` agents).
- `dependencies` is a JSON **array** of names, not an object. Kept unpinned so it always resolves.

## Before committing

- `claude plugin validate .` (marketplace) and `claude plugin validate ./plus-ultra` (plugin +
  frontmatter/hooks JSON) must pass.
- Codex packaging should install from a clean temporary `CODEX_HOME`:
  `CODEX_HOME="$(pwd)/.context/codex-home" codex plugin marketplace add "$(pwd)"`, then
  `CODEX_HOME="$(pwd)/.context/codex-home" codex plugin add plus-ultra@plus-ultra`.
- Test hook scripts by piping a sample payload:
  `echo '<json>' | node plus-ultra/hooks/<script>.mjs; echo "exit=$?"`.
  Set `PLUS_ULTRA_HOOK_DEBUG=1` to dump the raw hook payload to stderr.
- Deny paths should exit 0 with a decision JSON; allow paths exit 0 silent; blockers use the marker
  under `${CLAUDE_PROJECT_DIR}/.claude/plus-ultra/state/<session_id>.json`.

## Installing and updating

- Codex stable install: `codex plugin marketplace add maurocicerchia/plus-ultra --ref main`, then
  `codex plugin add plus-ultra@plus-ultra`. Update with `codex plugin marketplace upgrade plus-ultra`
  and run `codex plugin add plus-ultra@plus-ultra` again.
- Claude update: `claude plugin marketplace update plus-ultra`, then
  `claude plugin update plus-ultra@plus-ultra`.
- Cursor users refresh or reinstall from its marketplace; do not invent an unverified CLI command.

## Multi-agent

Only the `skills/` dir (portable markdown) ports across every agent; every manifest points at it.
Codex also supports lifecycle hooks, so it ships `hooks/hooks-codex.json`. Claude's slash commands
and Markdown subagents do not port directly; keep portable equivalents as skills. When editing a
skill, remember it must read well for any agent, not just Claude — keep Claude-only mechanics
(hooks, subagents, `${CLAUDE_PLUGIN_ROOT}`) out of skill prose. To add another agent, drop in its
`.<agent>-plugin/plugin.json` (or marketplace entry) with `"skills": "./skills/"`; don't duplicate
skill content.

## Human integration boundary

Plans, specs, Issues, and earlier messages never authorize merging or publishing. An implementation
agent may edit files, verify, commit, push a feature branch, create or update a pull request, and
submit or update a stack. It reports ready for integration or ready for review and stops.

An implementation agent must not autonomously merge, enable auto-merge, push to the default branch,
create or publish a release, or create or publish a tag. Equivalent GitHub API and GraphQL
mutations are also out of bounds. If a plan documents a rollout, keep it under `## Post-approval
integration`, outside executable checklists, as manual instructions for the human who owns that
action.

`plus-ultra:integration-boundary` is the portable policy skill. Claude Code and Codex support
lifecycle hooks for deterministic guardrails around recognized integration commands. Cursor ships
the portable skill only and is documentation-only, so this is a cooperative-agent safety boundary,
not a security sandbox. Do not introduce a `plus-ultra:integrate` command or automatic integration
workflow.
