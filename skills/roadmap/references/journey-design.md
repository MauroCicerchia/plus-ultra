# UI journey

Read this only when the repository has a root `DESIGN.md` and no `designs/journey.html`.

`DESIGN.md` holds the product-level visual direction. The journey holds the screens: one
mid-fidelity design of the whole MVP, made while the whole MVP is in view, so each Story's design
starts from shared navigation, flows, and components instead of from zero. It is a reference, not
product code.

## What it shows

Draft it after decomposing the tree, from the tree and `DESIGN.md`:

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

## Approve, then hand off

Show the tree, the full mutation list, and the validated journey together. The mutation list also
names the journey's feature branch, its commit, and its pull request. One explicit approval covers
all of them. A requested change revises the affected parts, which are shown again before any
write.

After approval:

1. Create each UI Story with a link to its journey sections, `designs/journey.html#<id>`, in its
   body. The section `id`s are settled in the proposal, so no Story needs a second edit.
2. Replace the Story titles the journey names with the created Issue numbers.
3. Commit `designs/journey.html` on a feature branch and open a pull request against the default
   branch.
4. Report its URL and say that design refinement of the UI Stories waits for that pull request to
   merge.

Never merge it, enable auto-merge, or push the default branch; `plus-ultra:integration-boundary`
applies.

Do not add a renderer, generator, component library, manifest, or versioning scheme. A text editor
and a browser are the whole toolchain.
