---
name: verification
description: Use when running or reviewing tests, typechecks, lint, builds, packaging checks, or other deterministic verification whose output should remain compact and traceable.
---

# Compact verification

Use the project-local wrapper for deterministic checks so a clean result is concise while warnings
and failures retain actionable evidence. The wrapper is a checked-in project file, not a dependency
on an agent installation.

## Run a check

```sh
node scripts/plus-ultra-verify.mjs <label> -- <command> [args…]
```

`label` is a lowercase slug. Use `test` and `typecheck` for those checks; use names such as `lint`,
`build`, or `packaging` for the rest. Treat a non-zero exit or an unknown source state as
unverified. Read the receipt before claiming a check passed.

## Install and inspect

For initial setup, updating the checked-in wrapper, retained logs, and bounded Git/GitHub inspection
recipes, read [verification operations](./references/verification-operations.md). Do not replace
unrelated `git` or `gh` commands with a general interceptor.
