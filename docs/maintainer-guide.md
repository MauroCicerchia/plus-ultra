# Plus Ultra maintainer guide

## Layout and portability

The repository root is the plugin for every supported agent. `.claude-plugin/marketplace.json`
lists Superpowers and the local plugin; the Claude, Codex, Cursor, and open-agents manifests point
to the shared `skills/` directory. `commands/` and `agents/` are Claude-specific. `hooks/` holds
the Claude and Codex hook manifests plus zero-dependency Node ESM scripts; shared stdin and
decision helpers live in `hooks/_lib.mjs`.

GitHub access uses `gh`; no MCP is bundled. A portable skill must not refer to Claude-only roots,
hooks, commands, or Markdown subagents. To add an agent platform, add its manifest and reuse the
shared skills rather than duplicating them.

## Validation and local development

Run `node --test tests/*.test.mjs`, `node scripts/check-context-budget.mjs`, and
`node scripts/validate-packaging.mjs`. Before committing, validate both the marketplace and Claude
plugin with `claude plugin validate .` and `claude plugin validate .claude-plugin/plugin.json`.
Test hooks with representative JSON payloads; allow paths are silent, deny paths emit a decision
JSON and exit zero, and commit blockers use their documented marker state.

For local Codex dogfooding, use `node scripts/codex-local.mjs refresh`; it creates a temporary
marketplace under `.context/`. Restore the released plugin with `node scripts/codex-local.mjs restore`.
For a clean manual install, add the local marketplace and then `plus-ultra@plus-ultra` using a
temporary `CODEX_HOME` under `.context/`.

## Installation and update reference

Install the stable Codex plugin with `codex plugin marketplace add maurocicerchia/plus-ultra --ref main`
then `codex plugin add plus-ultra@plus-ultra`; update with `codex plugin marketplace upgrade plus-ultra`
and run `codex plugin add plus-ultra@plus-ultra` again. Claude users update with
`claude plugin marketplace update plus-ultra` then `claude plugin update plus-ultra@plus-ultra`.
Cursor users refresh or reinstall from its marketplace because no verified Cursor CLI update command
exists.

## Integration policy

The detailed human integration boundary lives in `plus-ultra:integration-boundary`. Hooks provide
cooperative guardrails for Claude and Codex; Cursor receives the portable documentation-only
policy. Never add an automatic integration command or workflow.
