---
title: Add durable product brief
status: approved
issue: 36
created: 2026-09-07
---

# 010 — Add durable product brief

## Problem

Product intent is currently held in transient conversations and individual workflow artifacts.
Consequently, new-project scaffolding, planning, issue refinement, specification work, and
significant design or feature work can proceed from inconsistent assumptions. The plugin needs one
portable, human-approved current-state product brief without making product discovery an implicit
side effect of unrelated workflows.

## Goals / Non-goals

**Goals**

- Add a portable `plus-ultra:product-discovery` skill as the exclusive owner of creating and
  strategically updating `docs/product.md`.
- Define one canonical, current-state product-brief structure and an approval-gated discovery
  interaction for initial discovery and focused updates.
- Let existing workflows consume a present brief, while preserving their current behavior for
  repositories that do not have one.
- Require a focused rediscovery pause before a workflow continues through a durable contradiction
  with the approved brief.

**Non-goals**

- Add commands, hooks, scripts, dependencies, manifests, persistent workflow state, or
  platform-specific behavior.
- Make a consumer workflow create or mutate `docs/product.md`, including as a fallback when it is
  missing.
- Turn `docs/product.md` into an interview transcript, decision log, roadmap, implementation
  plan, or append-only journal.
- Change the ownership of implementation planning, technical specifications, issue progress, or
  stack selection after the required greenfield gate.

## Acceptance criteria

- [ ] `skills/product-discovery/SKILL.md` is a portable, namespaced
      `plus-ultra:product-discovery` skill and is the only workflow authorized to create or make
      strategic updates to `docs/product.md`.
- [ ] `docs/product.md` contains exactly the following canonical sections, in this exact order:
      `Target user`; `Core problem`; `Current alternative`; `Value proposition`; `MVP hypothesis`;
      `Core user journeys`; `Non-goals`; `Success criteria`; `Product principles and constraints`.
- [ ] Product discovery supports initial adaptive discovery, focused update, and read-only
      consumption modes with the behaviors defined by this contract.
- [ ] An initial write and every strategic change show a complete visible proposal and require
      explicit human approval before `docs/product.md` is written; declined or unapproved proposals
      leave the file unchanged.
- [ ] A focused update shows only affected decisions, preserves every unaffected canonical section,
      and rewrites the brief as current state rather than appending historical entries.
- [ ] The discovery interview uses conversation-supported context, makes material assumptions
      visible, asks one relevant decision at a time, presents two or three alternatives with
      trade-offs and a recommendation, and challenges requested scope that is not tied to the MVP
      hypothesis.
- [ ] `plus-ultra:new-project` stops greenfield scaffolding before stack selection when no brief
      exists, and routes the user to initial discovery rather than selecting a stack.
- [ ] When `docs/product.md` exists, `roadmap-planning`, `refine-issues`, `spec`, and significant
      design or feature work through `spec-conventions` consume it as context without creating or
      mutating it.
- [ ] Existing repositories without `docs/product.md` continue those consumer workflows without
      errors or implicit brief creation.
- [ ] A durable contradiction found by a consumer pauses its current workflow for focused
      rediscovery; it resumes only after the resulting change has explicit human approval.
- [ ] Contract tests cover structure, ownership, modes, approval gating, consumer behavior,
      missing-brief compatibility, contradiction pauses, and the absence of new platform-specific
      surfaces.

## Interface contracts

The only durable product-brief path is `docs/product.md`. It is a current-state Markdown document
with exactly this section sequence and no alternative or supplementary product-decision sections:

```markdown
# Product brief

## Target user
## Core problem
## Current alternative
## Value proposition
## MVP hypothesis
## Core user journeys
## Non-goals
## Success criteria
## Product principles and constraints
```

`plus-ultra:product-discovery` has three conceptual modes:

1. **Initial adaptive discovery** — used to establish a missing brief. It uses relevant
   conversation-supported context, labels material assumptions, and asks one decision at a time.
   Each question offers two or three alternatives, their trade-offs, and a recommendation. Before
   writing, it displays the entire proposed brief and waits for explicit human approval.
2. **Focused update** — used for a requested strategic change or a durable contradiction. It
   identifies the affected decisions, displays only those proposed decisions for approval, retains
   all unaffected sections verbatim in meaning, then writes a complete replacement current-state
   brief only after explicit approval.
3. **Read-only consumption** — used by all other workflows. A consumer may read and apply an
   existing brief as context, but never creates, edits, or appends to it.

A strategic change includes a material revision to the target user, problem, alternative, value
proposition, MVP hypothesis, journeys, non-goals, success criteria, or product principles and
constraints. The skill must challenge scope that lacks a clear connection to the MVP hypothesis;
it must not silently encode that scope as a product decision.

The consumer gate is:

```text
new-project + no docs/product.md (greenfield) -> initial adaptive discovery -> approved brief
                                                 -> stack selection and scaffolding
consumer + docs/product.md                    -> read-only consumption
consumer + no docs/product.md (existing repo) -> continue normally
durable contradiction                         -> pause -> focused update -> explicit approval
                                                 -> resume current workflow
```

`new-project` applies its missing-brief gate only to greenfield scaffolding and before stack
selection. `roadmap-planning`, `refine-issues`, `spec`, and significant design or feature work
that enters through `spec-conventions` are consumers. A contradiction is durable when the proposed
work would materially conflict with the brief rather than merely require an implementation-level
choice; consumers pause rather than resolve it themselves.

## Architecture boundaries

`skills/product-discovery/SKILL.md` is the portable owner of discovery, proposal display, approval,
and the sole write authority for `docs/product.md`. `docs/product.md` is the durable product-state
artifact it owns. `skills/new-project/SKILL.md` owns the greenfield pre-stack gate. The
`roadmap-planning`, `refine-issues`, `spec`, and `spec-conventions` skills remain read-only
consumers, with `spec-conventions` defining the entry point for significant design and feature
work.

No host-specific command, hook, script, manifest, dependency, adapter, or runtime behavior is part
of this design. Conversation and human approval are interaction boundaries; durable file writes are
isolated exclusively behind the product-discovery skill.

## Functional core

The policy is a deterministic decision over: whether a brief exists, workflow role, repository
context, whether a proposed change is strategic, and whether a durable contradiction is present.
It yields one of initial discovery, focused update, read-only consumption, normal continuation, or
pause pending approved rediscovery. The human interview and filesystem write are side effects; the
approval decision is explicit input and no unapproved proposal changes durable state.

## Data model

The sole new durable shape is `docs/product.md` with the canonical sections in the Interface
contracts section. It stores the current approved product state only. It stores no approval marker,
interview transcript, historical revisions, workflow status, or platform-specific metadata.

## Test plan

- Add contract tests for product-discovery frontmatter, portability, sole-write ownership, the
  exact ordered canonical headings, and current-state replacement semantics.
- Test initial discovery proposal visibility and explicit approval; test focused updates expose only
  affected decisions, preserve unaffected sections, and do not write when unapproved.
- Test conversation-context use, visible material assumptions, one-decision questioning, two-to-three
  option trade-offs with a recommendation, and MVP-hypothesis scope challenge behavior.
- Test the greenfield new-project gate occurs before stack selection, consumers read a present
  brief, repositories without one continue normally, and durable contradictions pause then resume
  only after focused-update approval.
- Run focused contract tests, the full Node suite, `git diff --check`, package validation, and
  applicable Claude and Codex packaging validation when implementation begins.

## Risks

- An overly broad contradiction rule could interrupt routine implementation work; restrict it to
  material product-state conflicts and leave technical choices with the consumer workflow.
- An overly narrow rule could let product intent drift; require focused rediscovery whenever the
  durable brief and proposed work cannot both remain true.
- A partial focused proposal could hide downstream effects; preserve unaffected sections and require
  a complete current-state document on every approved write.
- Consumers might accidentally become writers as workflows evolve; contract tests and the explicit
  exclusive-ownership boundary prevent implicit creation or mutation.
- The brief can become stale; focused updates retain a deliberate human approval point while
  avoiding an append-only history that obscures the current product decision.
