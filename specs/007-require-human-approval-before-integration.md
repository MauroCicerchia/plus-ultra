---
title: Require human approval before integration
status: approved
issue: 52
created: 2026-09-06
---

# 007 — Require human approval before integration

## Problem

An implementation agent interpreted rollout instructions in an implementation plan as permission to
merge an entire PR stack. Plans, specs, Issues, and prior agent messages can describe future work,
but they cannot grant authority to integrate or publish it.

## Goals / Non-goals

**Goals**

- Establish a global human-owned boundary after implementation, verification, and PR/stack
  preparation.
- Let agents autonomously prepare reviewable work while preventing recognized integration and
  publication actions without explicit user authorization in the current execution.
- Make manual rollout procedures visibly separate from executable implementation steps.

**Non-goals**

- Add a `plus-ultra:integrate` command, automatic integration workflow, or permission bypass.
- Treat hook enforcement as a security sandbox rather than a cooperative-agent safety rail.
- Block feature-branch pushes, PR creation or updates, stack submission, or other review
  preparation.

## Acceptance criteria

- [x] Plus Ultra documents that plans, specs, Issues, and earlier messages never authorize merging
      or publishing.
- [x] Implementation workflows stop at PR or PR-stack ready for integration rather than merging.
- [x] `gh pr merge`, including auto-merge, is blocked during normal implementation-agent execution.
- [x] `gh stack merge` is blocked during normal implementation-agent execution.
- [x] Direct pushes to `main`, `master`, and the locally detectable default branch are blocked.
- [x] Tag and release publication paths that publicly integrate a change are blocked when
      recognized.
- [x] Recognized GitHub API or GraphQL merge, auto-merge, merge-queue, release, and tag mutations
      are blocked.
- [x] Feature-branch pushes, PR creation or updates, stack submission, local tags, help, and
      dry-runs remain allowed.
- [x] Planning guidance puts rollout steps under `## Post-approval integration`, outside executable
      checklists, with a manual-execution warning.
- [x] A regression test reproduces the original `gh stack merge --yes --squash` incident and
      prevents its execution.
- [x] No `plus-ultra:integrate` command or automatic integration workflow is introduced.

## Interface contracts

- `plus-ultra:integration-boundary` is a portable skill used when finishing implementation or
  handling merges, releases, tags, and protected pushes. It ends agent work at `ready for
  integration`.
- A later dependency-free PreToolUse integration gate will deny recognized integration commands for
  Claude Code and Codex while allowing normal review preparation. Cursor receives the portable
  policy skill but has no lifecycle-hook integration in this plugin.
- `## Post-approval integration` is reserved for manual rollout instructions; it is not an
  executable implementation checklist.

## Architecture boundaries

The durable policy lives in a portable skill and documentation shared by every supported agent.
Platform-specific lifecycle enforcement remains isolated in hook scripts and their manifests, so
the portable policy neither depends on nor references a particular host runtime.

## Functional core

The later gate's command recognition will be a pure, bounded classification step over a shell
command string. Reading local Git references and emitting a hook decision are adapters around that
core; failures must fail open except for deliberate, recognized deny decisions.

## Data model

No persistent state or schema is added. Existing specs, plans, Issues, and messages remain
documentation and context, not authority records.

## Test plan

- Verify documentation and skill tests cover the durable spec, activation triggers, permitted and
  prohibited boundaries, manual rollout wording, and platform limitations.
- Add hook-level deny and allow tests before implementing the integration gate, including the
  original stack-merge incident and both Claude and Codex payload shapes.
- Validate hook registration order, plugin packaging, and clean Codex installation after manifest
  integration.

## Risks

Over-broad command matching could block harmless preparation, while narrow matching can miss an
equivalent integration command. Keep the policy explicit, classify only recognized command forms,
and preserve the human boundary even when a plan describes a manual rollout.
