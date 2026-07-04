---
name: conventional-commits
description: "The commit message format for this repo — Conventional Commits (type(scope): subject). Use whenever writing a git commit message, squashing, or shaping a PR title. Defines the allowed types, scope rules, subject style, body/footer conventions, and how breaking changes are marked. The commit-msg-lint hook enforces the header format on Claude Code."
---

# plus-ultra commit conventions

Every commit follows [Conventional Commits](https://www.conventionalcommits.org). The header is
machine-parseable so the changelog and semver bumps derive from history.

## Format

```
type(scope): subject

[optional body]

[optional footer(s)]
```

- **Header** — one line, `type(scope): subject`. Keep ≤ 72 chars. This is what the lint hook checks.
- **Blank line** then optional **body** — the *why*, wrapped ~72 cols. Not the *what* (the diff shows that).
- **Footer** — `BREAKING CHANGE: …`, or issue refs like `Refs: #12`, `Closes #12`.

## Types

| Type | Use for | semver |
|---|---|---|
| `feat` | a new user-facing capability | minor |
| `fix` | a bug fix | patch |
| `docs` | docs only | — |
| `refactor` | code change that isn't a feature or fix | — |
| `perf` | performance improvement | patch |
| `test` | adding/fixing tests only | — |
| `build` | build system, deps, tooling config | — |
| `ci` | CI config / workflows | — |
| `chore` | maintenance not covered above | — |
| `revert` | reverts a prior commit | — |

## Scope

Optional, lowercase, a noun for the area touched. In this harness's monorepo, prefer the workspace
or module: `feat(web): …`, `fix(api): …`, `refactor(shared): …`, `build(deps): …`. Omit if the change
is genuinely cross-cutting.

## Subject

- Imperative mood: "add", not "added"/"adds".
- No leading capital, no trailing period.
- Say what the change does, concretely: `fix(api): reject expired tokens` not `fix(api): bug fix`.

## Breaking changes

Either append `!` after the type/scope **and** explain in a footer:

```
feat(api)!: drop the v1 auth routes

BREAKING CHANGE: /v1/auth/* removed; migrate to /v2/session.
```

## Examples

```
feat(web): add keyboard nav to the command palette
fix(api): reject expired session tokens
refactor(shared): extract the zod user schema
docs: document the tech-stack defaults
build(deps): bump drizzle-orm to 0.44
```

## Fit with plus-ultra

- The **commit-msg-lint** hook (Claude Code) validates the header of `git commit -m` against this
  format and blocks a malformed message before the commit is created.
- Types map to `plus-ultra:release`'s changelog sections and semver bump.
