# Working in this repo

This repo **is** a Claude Code plugin (`plus-ultra`) plus its marketplace. It's a thin, opinionated
layer on top of [Superpowers](https://github.com/obra/superpowers); it does not reimplement that
methodology. End-user docs live in `README.md` — this file is for agents editing the plugin itself.

## Layout

```
.claude-plugin/marketplace.json     lists superpowers (github) + plus-ultra (./plus-ultra)
plus-ultra/.claude-plugin/plugin.json  manifest; dependencies: ["superpowers"] (array, unpinned)
plus-ultra/skills/                  portable markdown skills (SKILL.md + assets)
plus-ultra/agents/                  Claude Code subagents (*.md)
plus-ultra/hooks/                   hooks.json + zero-dep Node ESM scripts
plus-ultra/mcp/github.json          remote GitHub MCP
```

## Conventions

- **Hooks are dependency-free Node ESM** (`.mjs`), invoked as `node ${CLAUDE_PLUGIN_ROOT}/hooks/…`.
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
- Test hook scripts by piping a sample payload:
  `echo '<json>' | node plus-ultra/hooks/<script>.mjs; echo "exit=$?"`.
  Set `PLUS_ULTRA_HOOK_DEBUG=1` to dump the raw hook payload to stderr.
- Deny paths should exit 0 with a decision JSON; allow paths exit 0 silent; blockers use the marker
  under `${CLAUDE_PROJECT_DIR}/.claude/plus-ultra/state/<session_id>.json`.

## Portability note

Skills, the spec template, and the MCP server are portable across coding agents. Hooks and subagents
are Claude-Code-specific mechanisms (Codex/Cursor/etc. each have their own hook schema, or none), so
they do not port as-is. If multi-agent support is added, follow the Superpowers pattern: one shared
`skills/` dir, per-agent manifests, and per-agent (or empty) hook configs.
