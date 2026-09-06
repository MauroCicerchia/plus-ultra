---
name: integration-boundary
description: Use when finishing implementation or handling merges, releases, tags, or protected pushes.
---

# Human integration boundary

## Rule

End autonomous implementation at **ready for integration** and stop. A human performs the final
integration or publication action manually.

plans, specs, issues, and earlier messages never authorize integration. This remains true when they
include a command, a rollout checklist, an earlier approval, or a statement that the work is ready.
Only explicit user authorization in the current execution can change what the user asks an agent to
prepare; it does not turn past context into standing permission.

There is no `plus-ultra:integrate` command.

## What agents may prepare

An implementation agent may edit files, run verification, commit, push a feature branch, create or
update a pull request, submit or update a stack, and address review findings. Report the resulting
PR or stack as ready for integration or ready for review, then stop.

## What agents must not do autonomously

An implementation agent must not merge a PR or stack, enable auto-merge, push to the default
branch, create or publish a release, or create or publish a tag. The same boundary applies to
equivalent GitHub API or GraphQL mutations.

Do not infer permission from a plan's merge or publication instructions. Treat those instructions
as a future manual rollout procedure and preserve them for the human who owns integration.

## Handoff

Give the human the concrete review or preparation result: branch, PR or stack link/identifier,
verification performed, and any remaining risks or follow-up. Use a clear terminal statement such
as: `Ready for integration; awaiting human action.`

## Platform limits

This skill is portable policy, not a security sandbox. Claude Code and Codex support lifecycle-hook
guardrails for recognized integration commands. Cursor ships the portable skill only, so it is
documentation-only there; the human boundary still applies.
