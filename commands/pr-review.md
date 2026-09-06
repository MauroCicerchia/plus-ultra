---
description: Review a GitHub pull request against an approved technical contract and publish maintained review findings.
argument-hint: "[pr-number] [--spec <NNN|slug>]"
---

Arguments: `$ARGUMENTS`

Accept only these forms: `pr-review`, `pr-review <PR>`, `pr-review --spec <NNN|slug>`, and
`pr-review <PR> --spec <NNN|slug>`. `<PR>` is a positive integer. Reject unknown flags, duplicate
or missing `--spec` values, zero, negative, non-numeric, and extra positional arguments before any
GitHub write. The selector is only a fallback when canonical closing-Issue resolution fails.

Delegate the review to the `plus-ultra:pr-reviewer` agent. It must follow the portable
`plus-ultra:pr-review` workflow, including its validation and comment-maintenance rules.
