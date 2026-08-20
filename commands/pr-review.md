---
description: Review a GitHub pull request against the active spec and publish maintained review findings.
argument-hint: "[pr-number]"
---

Arguments: `$ARGUMENTS`

Accept no argument, which reviews the PR for the current branch, or one positive integer PR number.
If the argument is zero, negative, non-numeric, or there is more than one argument, explain the
valid forms and stop without performing any GitHub write.

Delegate the review to the `plus-ultra:pr-reviewer` agent. It must follow the portable
`plus-ultra:pr-review` workflow, including its validation and comment-maintenance rules.
