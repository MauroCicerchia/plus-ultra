---
name: design-artifacts
description: Use when creating, resolving, approving, or reviewing durable visual design artifacts for Issues, revising an approved Pencil design, or maintaining DESIGN.md.
---

# plus-ultra:design-artifacts

Keep visual decisions in numbered design pairs and reusable design rules in `DESIGN.md`.
Pencil (pen.dev) is an optional external capability. This skill defines artifact ownership and
lifecycle; UI-impact classification belongs to Issue #35, browser verification to #24, and workflow
orchestration to #22.

## Product context

When `docs/product.md` exists, read it as read-only product context before design work. When it is
absent, continue normally and never create it implicitly. Do not create, edit, or append to
`docs/product.md` in this workflow.

If proposed work creates a durable contradiction with that brief—both cannot materially remain
true—pause the affected workflow and route to `plus-ultra:product-discovery` for a focused strategic
update. Only after the resulting update has explicit human approval, resume. Implementation-level
choices remain here; they do not grant ownership of product direction.

## Artifact contract

One design is the pair `designs/NNN-slug.md` + `designs/NNN-slug.pen`, committed together as durable
project artifacts. Allocate the highest existing number across both file types and add one,
zero-padded to at least three digits. Start at `001`; never reuse a number or overwrite a pair.
Use [`assets/design-artifact.md`](./assets/design-artifact.md) for the manifest and replace all
example values before review.

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

`title` is nonempty. `issues` is a nonempty list of distinct positive integers from the current
repository. Explicitly enumerate the epic, when applicable, and every covered story. Never infer
coverage from remote hierarchy, an epic link, a filename, or prose. A shared journey may cover
multiple stories in one pair.

`pencil` is relative to the manifest's directory and points to its same-stem sibling, for example
`./001-checkout.pen`. Reject absolute paths, traversal (`..`), paths escaping through symlinks,
and mismatched stems. Require nonempty `surfaces` with unique IDs: each `id` is an opaque, nonempty
Pencil node ID, and each `name` is a human-readable surface name. `created` is a real calendar date
in `YYYY-MM-DD` format. Optional `supersedes` is the quoted sequence of the prior pair, such as
`"001"`, not an Issue number; the prior pair must exist and be explicitly identified.

## Resolve an Issue

Resolution is read-only and does not require Pencil. Given a positive Issue number, inspect local
`designs/*.md` frontmatter. Consider only `approved` manifests with an exact integer match in
`issues`; ignore `draft` and `superseded` manifests. Do not traverse remote Issue hierarchy.

| Match count | Result and next action |
| --- | --- |
| Zero matches | Return `{ result: none }`; continue work that does not depend on an approved visual design. Do not create an artifact or select a draft as a fallback. |
| One match | Return `selected` with the manifest path, resolved `pencil` path, and declared `surfaces`. Selection identifies the existing approval; it does not claim fresh visual verification. |
| Multiple matches | Return `ambiguous` with all candidates: manifest paths, titles, Pencil paths, and surfaces. Pause dependent work for explicit human selection of a candidate. |

Never guess or choose by recency, filename, file order, or apparent specificity. A selection resolves
only this request; it does not change approval status or supersede another candidate. Report
malformed manifests or broken paired paths as validation problems and pause affected consumption;
do not silently discard them to manufacture `none` or a unique match. Live surface verification
belongs to visual review, so an unavailable editor alone does not block local resolution.

## Pencil capability

Inspect available tool definitions for `get_app_state` and `execute`; use their current schemas.
`get_app_state` identifies the active document. Within `execute`, `Get` reads nodes and
`TakeScreenshot` captures surfaces; use the advertised operations for draft node manipulation.
Check `get_app_state` before every mutation or visual verification and ensure the active document
is the intended `.pen` at its resolved path. Node names alone cannot establish file identity.
Save the draft to its paired path before review; verify that the saved file and reviewed document
correspond.

If Pencil is unavailable, required operations are missing, or the wrong file is open, pause only
visual authoring, review, or approval. Explain the missing capability or exact file that must be
opened. Existing-artifact resolution and independent nonvisual work continue, including reading
manifests, product context, and reusable `DESIGN.md` rules. Do not fabricate screenshots or claim
visual verification. Missing surface IDs likewise block the affected visual check; inspect the
correct document before proposing a repair to a draft.

Tool behavior is documented in [Pencil AI integration](https://docs.pencil.dev/getting-started/ai-integration).
See [Pencil files](https://docs.pencil.dev/core-concepts/pen-files) for the versionable `.pen` format
and saving workflow. These are external capabilities, not installation requirements of this skill.

## Create a draft

Read product context and an existing `DESIGN.md`, identify the explicit Issue coverage, and allocate
the next pair. A new design always starts in `draft`. Author its `.pen` through Pencil after the
active-file check, recording the actual surface IDs and names in the manifest. Do not populate
IDs from guesses or leave template placeholders as purported evidence. Describe scoped visual
decisions in the manifest body, with reusable rules referenced from `DESIGN.md`.

When visual authoring is blocked, text preparation may continue as clearly incomplete draft work;
do not claim the pair is complete until its saved `.pen` exists and its surfaces are verified.

## Approve a draft

1. Validate all manifest fields, explicit Issue coverage, and the existing saved `.pen` path.
2. Use `get_app_state` to verify the active file path matches that paired `.pen`.
3. Use `execute` with `Get` to verify every surface ID exists in that document, then
   `TakeScreenshot` for every surface. Inspect the captures against the stated design intent and
   applicable `DESIGN.md` rules. A missing surface or failed capture pauses approval; never invent
   a replacement ID or evidence.
4. Show the proposed manifest, Issue coverage, and surface captures together, naming the exact pair
   and any replacement. Resolve review findings before asking for a decision.
5. Only explicit human approval of that reviewed pair permits changing `status` to `approved`.
   An implementation request, plan approval, successful check, or agent recommendation is not design
   approval. A declined or unapproved proposal remains `draft`, with lifecycle state unchanged.

Approval applies to the reviewed version. Edits after review require renewed verification and an
explicit decision on the changed version. Record concise review evidence in the manifest body,
including the actual human decision when given; do not invent approvers or timestamps.

## Revise an approved design

Create the next numbered pair as `draft`; set `supersedes` to the previous pair's `NNN`. Copy the
prior `.pen` to the new path before editing, then confirm the new draft is active in Pencil.
Never modify an approved `.pen`, even for a small correction. Preserve the prior manifest's
coverage, surface declarations, and evidence during drafting; express proposed changes in the new
manifest. The prior pair remains approved until the replacement is approved.

Use the full approval workflow for the revision. Only after explicit human approval of the new
pair, mark the new manifest `approved` and the referenced prior manifest `superseded` as the same
lifecycle update. The old `.pen` stays unchanged. If the proposal is declined or unapproved, the
prior pair stays unchanged and the revision stays draft. If a lifecycle write is interrupted,
report the incomplete transition; multiple approved matches still resolve as ambiguous. No
implicit deletion, coverage transfer, or retirement of other approved pairs is allowed.

## Review a design

Review is read-only: inspect the manifest's Issue coverage, paired path, surface IDs and captures,
and applicable `DESIGN.md` rules using the Pencil checks above. Report each finding with its
manifest path and surface ID, observed evidence, and required change. Separate verified findings
from incomplete checks. With unavailable Pencil or missing evidence, report visual review as
incomplete, identifying what remains unverified; independent text review may continue.

Do not edit the pair, approve it, or change status during review. A requested fix to an approved
pair enters the revision workflow. Review output is evidence for a human decision, not approval.
Browser-based implementation verification remains the separate concern of Issue #24.

## Maintain DESIGN.md

The root-level `DESIGN.md` holds reusable principles, rules, tokens, and component behavior. Start
from [`assets/DESIGN.md`](./assets/DESIGN.md); retain its canonical heading order and three token
layers: primitive values → semantic roles → component uses. Document typography, color, spacing
and density, components and states, responsive behavior, motion, and accessibility at system level.
Do not duplicate concrete screen layouts from `.pen` files here; exact screens and journey-specific
decisions stay with their numbered pair.

For creation or a requested system update, show a concrete proposal and obtain explicit human
approval before writing or updating `DESIGN.md`. Preserve unaffected rules in an update. A declined
or unapproved proposal leaves an existing file unchanged and a missing file absent. A text-only
system update may proceed without Pencil when its evidence is available; state any unverified
visual implications. Approval of `DESIGN.md` does not approve a numbered artifact or authorize
editing approved `.pen` files. If new system rules conflict with an approved design, report that
conflict for an explicit revision or system decision instead of silently reconciling either file.

## Resolution examples

| Case | Issue and local manifests | Result |
| --- | --- | --- |
| Single story | Issue 184; `001` approved with `issues: [184]` | `selected` with `001` manifest, Pencil path, and surfaces |
| Shared journey | Issue 185; `002` approved with `issues: [180, 184, 185]` | `selected` with `002`; Issue 184 selects that same journey when it is the only match |
| Excluded statuses | Issue 184; `001` draft and `002` superseded, both list 184 | `none` |
| No match | Issue 186; `002` approved with `issues: [180, 184, 185]` | `none`; no inferred child coverage |
| Ambiguous | Issue 184; `001` approved and `002` approved, both list 184 | `ambiguous` with both candidates; wait for explicit selection |
