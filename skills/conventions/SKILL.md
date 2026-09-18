---
name: conventions
description: Use when writing a commit message, deciding where a workflow artifact belongs, numbering an optional spec, or checking which GitHub CLI features a workflow may rely on.
---

# Repository conventions

The small set of conventions every other Plus Ultra capability assumes.

## GitHub CLI

Plus Ultra requires **GitHub CLI 2.94.0 or newer**, which introduced native Issue hierarchy
(`gh issue create --parent`, `gh issue edit --add-sub-issue`, and the `parent`, `subIssues`, and
`subIssuesSummary` JSON fields).

Before the first GitHub write in a workflow, check `gh --version`. Below 2.94.0, stop and say:

```
Plus Ultra requires GitHub CLI 2.94.0 or newer; found <version>. Upgrade gh and retry.
```

Do not fall back to GraphQL to emulate a missing hierarchy capability.

## Where artifacts live

| Artifact | Location | Committed |
| --- | --- | --- |
| Product brief | `docs/product.md` | yes |
| Work items | GitHub Issues | n/a |
| Optional technical spec | `specs/NNN-slug.md` | yes |
| Optional design reference | Issue comment, `designs/`, or a link | as convenient |
| Plans, notes, scratch work | `.context/` | **no** |
| Durable project documentation | `docs/` | yes |

Ensure `.gitignore` contains `/.context/` before writing anything there. A plan is transient: it
belongs in `.context/`, not in the repository's documentation.

Specs are optional. Number them with a zero-padded three-digit prefix, never reuse a number, and
take the next number from the highest existing one. There is no draft/approved/superseded
lifecycle: a committed spec is the current contract, and the Issue owns work state.

## Commit messages

Every commit follows [Conventional Commits](https://www.conventionalcommits.org), because release
tooling derives versions and changelogs from history.

```
type(scope): subject

[optional body explaining why]

[optional footer: BREAKING CHANGE: …, Refs: #12, Closes #12]
```

- **type** — `feat` (minor), `fix` (patch), `perf` (patch), `docs`, `refactor`, `test`, `build`,
  `ci`, `chore`, `revert`.
- **scope** — optional, lowercase, a noun for the area touched. Omit when genuinely cross-cutting.
- **subject** — imperative mood, no leading capital, no trailing period, header ≤ 72 characters.
- **breaking** — append `!` after the type or scope **and** explain in a `BREAKING CHANGE:` footer.

Write the body for the reader who asks why this change exists; the diff already says what changed.
