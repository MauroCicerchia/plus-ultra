---
title: Define Pencil-backed design artifacts
status: approved
issue: 16
created: 2026-09-07
---

# 011 — Define Pencil-backed design artifacts

## Problem

Visual design decisions need a durable, reviewable source of truth linked to the Issues they
cover. Without an explicit artifact contract, agents can guess between competing designs, edit an
approved design in place, infer story coverage from an epic, or block unrelated work when a visual
tool is unavailable. Reusable design-system rules also need a clear boundary from concrete screens.

## Goals / Non-goals

**Goals**

- Add the portable `plus-ultra:design-artifacts` skill with manifest and design-system templates.
- Define creation, deterministic Issue resolution, explicit human approval, read-only review, and
  revision for durable Pencil-backed design pairs.
- Keep reusable current design rules in root `DESIGN.md`, separate from concrete `.pen` screens.
- Consume a present `docs/product.md` without taking ownership of it.
- Treat Pencil/pen.dev as an optional external capability with a narrowly scoped visual pause.

**Non-goals**

- Add commands, hooks, scripts, dependencies, manifest changes, or platform-specific mechanisms.
- Classify UI impact (Issue #35), implement browser verification (Issue #24), or orchestrate
  workflows and persistent execution state (Issue #22).
- Infer Issue coverage through remote hierarchy, replace technical specs or Issue progress, or
  automatically approve, merge, publish, tag, or release anything.

## Acceptance criteria

- [x] The portable `skills/design-artifacts/SKILL.md` ships with both templates and coherent
      `agents/openai.yaml` metadata enabling implicit invocation, without new platform surfaces.
- [x] Each design is a same-stem `designs/NNN-slug.md` / `designs/NNN-slug.pen` pair using the
      typed manifest below and explicit epic/story coverage; no hierarchy inference is allowed.
- [x] Resolution uses only approved exact Issue matches: one selects the manifest, Pencil path,
      and surfaces; zero returns `none`; multiple return `ambiguous` and require explicit selection.
- [x] A new design starts draft. Approval validates the saved `.pen`, active file, actual surface
      IDs and captures, and requires explicit human approval of the reviewed pair.
- [x] Revision creates the next numbered draft pair with `supersedes`. The prior pair stays
      approved until explicit approval of the replacement; then its manifest becomes superseded
      and its `.pen` remains unchanged.
- [x] Read-only review reports observed evidence and actionable findings without editing the pair
      or changing approval state; incomplete visual checks remain explicitly unverified.
- [x] Root `DESIGN.md` has the canonical principles, three token layers, typography, color, spacing
      and density, components and states, responsive, motion, and accessibility sections. It holds
      reusable rules, does not duplicate screens, and its writes require explicit human approval.
- [x] A present `docs/product.md` is read-only context. Its absence permits normal continuation;
      durable contradictions pause for product-discovery and resume only after approved updating.
- [x] Pencil tools `get_app_state` and `execute` verify the active document, manipulate draft nodes,
      and capture surfaces. Unavailable tools, a wrong active file, or missing surfaces pause the
      affected visual work; artifact resolution and independent nonvisual work continue.
- [x] README documents the portable workflow, lifecycle, exact resolution, design-system boundary,
      and optional Pencil behavior. Contract and isolated forward tests cover the stated scenarios.

## Interface contracts

```text
DesignStatus = draft | approved | superseded

DesignArtifactManifest = {
  title: string
  status: DesignStatus
  issues: PositiveInteger[]
  pencil: RelativePenPath
  surfaces: { id: PencilNodeId, name: string }[]
  created: YYYY-MM-DD
  supersedes?: "NNN"
}

DesignResolution =
  | { result: selected, manifest, pencil, surfaces }
  | { result: none }
  | { result: ambiguous, candidates }
```

Manifest files use YAML frontmatter. `title`, `issues`, and `surfaces` are nonempty. Issue numbers
are distinct positive integers for the current repository and enumerate the epic, if applicable,
and all covered stories. Surface IDs are unique opaque Pencil node IDs with human-readable names.
The date is a real `YYYY-MM-DD` creation date. `pencil` is a relative same-stem sibling path resolved
from the manifest directory; absolute, traversal, escaping symlink, and mismatched paths are
invalid. `supersedes` identifies an existing prior pair's quoted sequence.

Numbering starts at `001`, uses at least three digits, and increments the highest number across
both file types. Creation never reuses a number. A revision copies the previous `.pen` into the
next pair before editing and preserves the prior manifest during drafting. After reviewed human
approval, the new manifest becomes approved and only the referenced prior manifest becomes
superseded. Declined or unapproved replacements leave the old pair unchanged.

Resolution is a local read-only operation over approved manifests listing the exact requested
Issue. It returns `none`, `selected`, or `ambiguous` according to match count. Ambiguity lists all
candidates and pauses dependent work until explicit human selection, never choosing by recency,
name, or order. Selection itself changes no lifecycle state. Invalid manifests or broken paths
are reported and pause affected consumption rather than being silently filtered out. Local
resolution does not claim that live surface checks have run.

Approval checks the saved paired path, matches `get_app_state` to the intended active file, uses
`execute` / `Get` for every surface ID, captures each surface through `TakeScreenshot`, and shows
the manifest, coverage, and captures for an explicit human decision on that exact version. Request
or plan approval does not approve a design. Changes after review require renewed verification.

Root `DESIGN.md` follows `assets/DESIGN.md` in this order: Principles; Tokens (Primitive tokens,
Semantic tokens, Component tokens); Typography; Color; Spacing and density; Components and states;
Responsive behavior; Motion; Accessibility. Creation and updates show a concrete proposal and
require explicit human approval before writing, preserving unaffected rules. Approval of reusable
rules does not approve a screen pair or authorize changing approved `.pen` files.

## Architecture boundaries

The skill owns artifact conventions and interaction policy. The manifest owns Issue linkage,
lifecycle, and pointers to concrete surfaces; its paired `.pen` owns visual decisions. `DESIGN.md`
owns reusable system rules. Only `plus-ultra:product-discovery` owns the durable product brief.
Pencil is the external visual editing and inspection boundary; no bundled runtime adapter is added.
UI classification, browser checks, and orchestration stay with #35, #24, and #22 respectively.

## Functional core

Resolution is a deterministic policy over local manifest status and explicit Issue membership.
Its conceptual results are selected, none, and ambiguous; no executable resolver is introduced.
Reading files, editing a draft through Pencil, capturing surfaces, receiving human approval, and
writing lifecycle changes are explicit side effects. Review and resolution remain read-only.
An unavailable editor affects visual work only. Human approval is explicit input and cannot be
derived from successful checks, a prior plan, an agent recommendation, or a lack of response.

## Data model

Durable artifacts are numbered Markdown/Pencil pairs plus root `DESIGN.md`. The manifest template
adds body sections for Scope and Issue coverage, Surfaces, Visual decisions, and Review evidence.
The body documents observed checks and the actual human decision without inventing a separate
approval state store. Only draft pairs are editable; the prior manifest's superseded transition
is the sole change to an approved pair when its replacement is approved. Existing history remains
readable. There are no database migrations, new dependencies, or manifest schema changes.

## Test plan

- Add contractual tests before production files and run `node --test tests/skills.test.mjs` to
  observe RED for missing files and guidance. Confirm GREEN after implementation.
- Verify frontmatter, metadata, manifest fields, exact template headings, approved spec #011,
  README workflow, portability, and absence of new platform-specific surfaces.
- Cover a single approved story, a shared approved journey with explicit stories, ignored draft
  and superseded manifests, no exact match, and ambiguity requiring explicit selection.
- Cover preserved prior approval during revision, full approval evidence, absent Pencil, wrong
  active file, missing surfaces, absent/present/contradictory product context, read-only review,
  and the separation of `DESIGN.md` rules from concrete screen decisions.
- Use isolated forward scenarios before and after implementation to check no guessed selection,
  no mutation of approved artifacts, and continuation of nonvisual work without Pencil.
- Run the focused and full Node suites, packaging validation, available Claude validation,
  clean temporary Codex installation with asset inspection, and `git diff --check` before commit.

## Risks

- Missing or changed Pencil operations can invalidate visual evidence; inspect current schemas,
  confirm the active file, and explicitly pause affected visual work without claiming success.
- A saved file can drift from the reviewed document; save and verify the paired file before human
  approval, and repeat review if the design changes.
- A partially written supersession can leave two approvals; report the interruption and retain
  ambiguous resolution until the authorized lifecycle update is completed.
- New design-system rules can conflict with an approved screen; report the conflict and use an
  explicit revision or system decision rather than changing the approved screen in place.
- Written guidance is cooperative, not a runtime enforcement mechanism. Contract tests and
  independent forward scenarios verify the policy without implying a live Pencil integration test.
