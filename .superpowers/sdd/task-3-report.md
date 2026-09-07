# Task 3 report — Plugin integration and validation

## Changes

- Registered the approved `hooks/integration-gate.mjs` before
  `dangerous-command.mjs` in both Claude and Codex PreToolUse Bash hook manifests.
- Updated both hook-manifest descriptions to include the human-integration guardrail.
- Added a manifest regression test requiring the gate file, both registrations, and the required
  order. Plugin versions, Cursor packaging, commands, agents, state, and dependencies were not
  changed.

## TDD evidence

RED — after adding the manifest test, before changing either manifest:

```text
$ node --test --test-name-pattern 'hook manifests register the integration gate before dangerous command' tests/hooks.test.mjs
✖ hook manifests register the integration gate before dangerous command
ℹ tests 1
ℹ pass 0
ℹ fail 1
AssertionError [ERR_ASSERTION]: hooks/hooks.json must register integration-gate.mjs
```

GREEN — after registering the existing approved gate:

```text
$ node --test --test-name-pattern 'hook manifests register the integration gate before dangerous command' tests/hooks.test.mjs
✔ hook manifests register the integration gate before dangerous command
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

## Requested validation

```text
$ node --test tests/hooks.test.mjs tests/skills.test.mjs
ℹ tests 108
ℹ pass 108
ℹ fail 0

$ node --test tests/*.test.mjs
ℹ tests 120
ℹ pass 120
ℹ fail 0

$ node scripts/validate-packaging.mjs
Packaging validation passed.

$ git diff --check
(exit 0; no output)

$ claude plugin validate .
✔ Validation passed

$ claude plugin validate .claude-plugin/plugin.json
✔ Validation passed

$ CODEX_HOME=<clean temporary directory> codex plugin marketplace add <repo>
Added marketplace `plus-ultra` from <repo>.

$ CODEX_HOME=<same temporary directory> codex plugin add plus-ultra@plus-ultra
Added plugin `plus-ultra` from marketplace `plus-ultra`.
Installed plugin root: <temporary CODEX_HOME>/plugins/cache/plus-ultra/plus-ultra/0.2.1
```

## Concern

The temporary `CODEX_HOME` was clean for the installation check. Its subsequent deletion command
(`rm -rf` against that exact `mktemp` path) was deliberately blocked by the existing
`dangerous-command` PreToolUse guardrail, so the temporary directory remains for system cleanup.
