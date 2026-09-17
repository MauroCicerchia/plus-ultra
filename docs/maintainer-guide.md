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

## Local context reducers

`scripts/context-reducers.mjs` is a Node ESM helper with no dependencies for reviewing this Plus
Ultra checkout. `pr-review-context --repo <owner/repo> --pr <positive-integer>` performs its own
read-only `gh` calls and emits compact JSON for the PR snapshot, remote specs, contract resolution,
and tagged review state. Use `comment-evidence` only to expand one identified tagged comment.

The helper is intentionally repository-local: do not copy it into consumer projects and do not
derive a plugin-cache path. It returns structured errors for malformed, ambiguous, paginated, or
stale inputs; before any review mutation, re-run it with `--expect-head <headRefOid>` and restart
the review if the head changed. This helper does not cache semantic conclusions, suppress
verification output, or replace the existing write guards.

## Project-local verification wrapper

Unlike the context reducer, `skills/verification/assets/plus-ultra-verify.mjs` is a consumer
template. Copy it into each project's `scripts/plus-ultra-verify.mjs` through the
`plus-ultra:verification` skill or the new-project scaffold, then version it with that project.
Do not make a consumer project invoke a plugin-cache path. The skill's operations reference covers
updates, receipts, and bounded Git/GitHub inspection.

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
