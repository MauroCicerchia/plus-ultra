# UI journey

Read this only when the repository has a root `DESIGN.md` and no `designs/journey.html`.

`DESIGN.md` holds the product-level visual direction. The journey holds the screens: one
mid-fidelity design of the whole MVP, made while the whole MVP is in view, so each Story's design
starts from shared navigation, flows, and components instead of from zero. It is a reference, not
product code.

## What it shows

Draft it after decomposing the tree, from the tree and `DESIGN.md`. For a product already underway,
draft it from what exists instead, as described below. It shows:

- the navigation map: every key screen and how the user moves between them;
- each key screen of the MVP;
- the main flows between screens, including those that cross Stories;
- the shared components, for example cards, sheets, and toasts.

Each screen and flow is its own `<section>` with a stable `id` and a visible heading, and names the
Stories that build it. A UI Story is one that builds at least one screen or flow in the journey.
Keep it mid fidelity: layout, hierarchy, shared components, and main copy. Say in the file that
loading, error, and empty states, edge cases, and polish are left to each Story's refinement.

Build and check it with the Construct and Validate rules of
[feature-design.md](../../refine-issue/references/feature-design.md): one self-contained HTML file,
`DESIGN.md` tokens as CSS custom properties, and both the structural and the visual audit before
approval.

## A product already underway

When the repository also has existing Epics or Stories, propose the journey for that existing tree,
with no new Epics or Stories unless the human asks for them. When they do, the journey covers them
too. Build it from what exists:

- A screen with an approved `designs/<issue>-<slug>.html` is drawn from it at mid fidelity, and its
  section names the design it comes from. Never redesign or edit an approved design.
- A shipped screen without an HTML design is drawn from the design reference its Issue recorded, a
  screenshot, a description, or `DESIGN.md` prose, and its section is marked as reconstructed for
  the human to check. Do not read or run the product's code to draw it.
- A screen of an open Story with no design yet is designed to match the existing screens.

When approved designs conflict on a shared pattern, such as navigation or a shared component, the
proposal lists each conflict with a recommended resolution, and the human chooses. The journey
follows the choice; the approved designs stay as they are.

When `DESIGN.md` describes screens, carry those descriptions into the journey and propose the
smallest `DESIGN.md` change that removes them, so one source describes screens. That change goes
through the same approval, and on the same feature branch and pull request, as the journey.

## Approve, then hand off

Show the tree, the full mutation list, and the validated journey together. The mutation list also
names the journey's feature branch, its commit, and its pull request. One explicit approval covers
all of them. A requested change revises the affected parts, which are shown again before any
write.

After approval:

1. Create each UI Story with a link to its journey sections, `designs/journey.html#<id>`, in its
   body. The section `id`s are settled in the proposal, so no Story needs a second edit. For a
   product already underway, edit each open UI Story's body to add a link to its sections instead;
   those edits are part of the approved mutation list.
2. For newly created Stories, replace the titles the journey names with their Issue numbers.
3. Commit `designs/journey.html`, with any approved `DESIGN.md` change, on a feature branch and open
   a pull request against the default branch.
4. Report its URL and say that design refinement of the UI Stories waits for that pull request to
   merge.

Never merge it, enable auto-merge, or push the default branch; `plus-ultra:integration-boundary`
applies.

Do not add a renderer, generator, component library, manifest, or versioning scheme. A text editor
and a browser are the whole toolchain.
