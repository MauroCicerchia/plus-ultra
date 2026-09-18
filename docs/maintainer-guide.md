# Plus Ultra maintainer guide

## Layout and portability

The repository root is the plugin for every supported agent. `.claude-plugin/marketplace.json`
lists Superpowers and the local plugin; the Claude, Codex, Cursor, and open-agents manifests point
to the shared `skills/` directory. `commands/` and `agents/` are Claude-specific. `hooks/` holds
the Claude and Codex hook manifests plus zero-dependency Node ESM scripts; shared stdin and
decision helpers live in `hooks/_lib.mjs`.

Eight skills ship: five user-facing capabilities (`new-project`, `product`, `roadmap`,
`refine-issue`, `implement-issue`) and three they share (`code-review`, `conventions`,
`integration-boundary`). Each capability has one Claude command in `commands/` and one Codex
interface at `skills/<name>/agents/openai.yaml`; keep those in sync with the skill set.

`MauroCicerchia/plus-ultra-template` is the canonical starting point for a compatible TypeScript
web product and owns the stack outright. `skills/new-project/references/canonical-template.md`
holds the fit judgement, the local instantiation commands, and the customization checklist; it must
never restate the template's dependencies, versions, or file layout.

GitHub access uses `gh`; no MCP is bundled. The supported floor is GitHub CLI 2.94.0, which
introduced native Issue hierarchy — `plus-ultra:conventions` states the requirement and the failure
message. A portable skill must not refer to Claude-only roots, hooks, commands, or Markdown
subagents. To add an agent platform, add its manifest and reuse the shared skills rather than
duplicating them.

## Validation and local development

Run, from the repository root:

```
node --test tests/*.test.mjs
node scripts/check-context-budget.mjs
node scripts/validate-packaging.mjs
claude plugin validate .
claude plugin validate .claude-plugin/plugin.json
```

`check-context-budget.mjs` is the mechanical complexity budget: it caps the number of skills and the
byte size of each always-loaded `SKILL.md` and of `AGENTS.md`. Detailed material belongs in an
on-demand `references/` file, which the budget deliberately ignores.

Test hooks with representative JSON payloads; allow paths are silent, deny paths emit a decision
JSON and exit zero, and commit blockers use their documented marker state.

For local Codex dogfooding, add this working tree as a marketplace under a temporary `CODEX_HOME`
inside `.context/`, then install `plus-ultra@plus-ultra` from it. Use a scratch `CODEX_HOME` so the
released plugin in your real Codex profile is untouched, and delete it when finished.

## Hooks

| Hook | Event | Behaviour |
| --- | --- | --- |
| `integration-gate.mjs` | PreToolUse (Bash) | Denies merges, auto-merge, releases, tags, and protected-branch pushes |
| `dangerous-command.mjs` | PreToolUse (Bash) | Denies recursive force-deletes and shared-branch force-pushes |
| `secret-scan.mjs` | PreToolUse (Bash) | Denies commits whose staged diff carries credentials |
| `commit-msg-lint.mjs` | PreToolUse (Bash) | Denies non-Conventional commit headers |
| `commit-gate.mjs` | PreToolUse (Bash) | Denies commits without a fresh passing test, and typecheck in TS projects |
| `test-marker.mjs` | PostToolUse (Bash) | Records passing test and typecheck runs against a working-tree fingerprint |
| `auto-format.mjs` | PostToolUse (Write/Edit) | Formats edited source files |

The integration gate parses shell syntax — quoting, heredocs, command substitution, `env`, `sudo`,
`xargs`, `sh -c`, `eval` — because that parsing is what makes the guarantee hard to bypass. Do not
replace it with pattern matching over the raw command string.

Its GraphQL classification is deliberately conservative rather than exact: a document that declares
a mutation and invokes a protected field is denied whatever `operationName` would have selected. It
therefore denies a little more than a full GraphQL parser would, and never less. A human can still
run the command.

The commit gate is not applied when every path that differs from `HEAD` is prose or an image, since
those cannot invalidate a recorded verification run. Any unreadable Git state keeps the gate on.

## Installation and update reference

Install the stable Codex plugin with `codex plugin marketplace add maurocicerchia/plus-ultra --ref main`
then `codex plugin add plus-ultra@plus-ultra`; update with `codex plugin marketplace upgrade plus-ultra`
and run `codex plugin add plus-ultra@plus-ultra` again. Claude users update with
`claude plugin marketplace update plus-ultra` then `claude plugin update plus-ultra@plus-ultra`.
Cursor users refresh or reinstall from its marketplace because no verified Cursor CLI update command
exists.

## Releases

Release Please owns `version.txt`, `.release-please-manifest.json`, `CHANGELOG.md`, and the version
field of the three plugin manifests. Never hand-edit those; commit a Conventional Commit and let the
release workflow open the release pull request. To force a specific version, add a
`Release-As: <version>` footer to the commit.

## Integration policy

The detailed human integration boundary lives in `plus-ultra:integration-boundary`. Hooks provide
cooperative guardrails for Claude and Codex; Cursor receives the portable documentation-only
policy. Never add an automatic integration command or workflow.
