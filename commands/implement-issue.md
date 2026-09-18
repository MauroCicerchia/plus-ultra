---
description: Take a GitHub Issue end to end — clarify, plan, implement, test, review, and open a PR ready for human review.
argument-hint: "<issue-number>"
---

Arguments: `$ARGUMENTS`

Accept exactly one positive Issue number. Otherwise explain the valid form and stop.

Follow the `plus-ultra:implement-issue` skill. Ask the user about material product, UX, security,
data, contract, or externally observable decisions; assume and proceed only on low-impact,
reversible implementation details. Use the `plus-ultra:code-reviewer` agent for independent review —
mandatory for high-risk work, when warranted for normal work, skipped by default for small work.

Stop at a pull request that is ready for human review. `plus-ultra:integration-boundary` applies.
