# Feature design

`DESIGN.md` is the approved product-level visual direction; `designs/<issue>-<slug>.html` becomes
the approved feature-level reference after human approval. It is a reference, not product code:
implementation rebuilds it in the product's own stack and never ships or imports it.

## Start from the UI journey

A product may have a UI journey at `designs/journey.html`: one mid-fidelity design of the whole
MVP, with each screen and flow in its own `<section>`. Without a journey, design from `DESIGN.md` as
below.

If the Story links to `designs/journey.html` but the file is not on the default branch (check the
fetched remote branch, not a local checkout), stop before proposing and make no GitHub write: say
that the journey's pull request must merge first.

When the journey is on the default branch, read the sections the Story links to, or, without links,
the sections that name the Story, before designing. Also read the approved designs of the other
Stories those sections name. When no section links to or names the Story, design from `DESIGN.md`
as below.

- Keep the journey's navigation, flows, and shared components. Add what it leaves out: loading,
  error, and empty states, edge cases, responsive detail, and polish.
- List every departure from the journey, with its reason, in the proposal the human approves.
- When an approved departure changes a shared pattern, such as navigation or a shared component,
  the same design pull request updates the journey's affected sections so later Stories follow
  it. A departure local to the Story leaves the journey as it is.

The Story still gets its own design: a journey section alone is never the Story's approved
reference.

## Construct

- Write one self-contained HTML file. Put all styling in an inline `<style>` element. Make no
  external requests: no CDN, remote font, remote image, remote script, package, or build step. Use
  the fonts `DESIGN.md` names with a system fallback, and inline SVG or plain shapes for imagery.
- Use no JavaScript by default. Show states side by side as static sections; use `<details>` or
  `:target` when an interaction must be shown. Add a small inline script only when the interaction
  cannot be shown any other way.
- Map relevant settled `DESIGN.md` tokens to CSS custom properties on `:root`, named after the
  tokens, before composing feature screens. Style with those properties, not raw values.
- Give each important screen and state its own `<section>` with a stable `id` and a visible heading
  that names it. Use semantic elements and realistic content.
- Show the responsive behaviour that matters, for example each screen at a narrow and a wide width.
- Edit the file incrementally. Fix completed sections in place instead of recreating them.

## Validate

Before human approval, perform both audits:

- **Structural:** read the file. Every expected screen and state has its own section; no `src`,
  `href`, `url()`, or `@import` points outside the file; no placeholder text remains; colour,
  type, and spacing come from the token custom properties.
- **Visual:** render the file and inspect every section at each relevant width for hierarchy,
  density, selected/unselected states, responsive behavior, validation and success states, and
  accidental visual additions. When the environment cannot render it, ask the human to open the
  file and confirm what they see.

Neither audit replaces the other.

## Hand off

Then hand off in order: present the refined Issue proposal and the validated design together, so
one explicit human approval covers both; commit the approved artifact at
`designs/<issue>-<slug>.html`, with any approved journey update; open a pull request with it
against the default branch, on which implementation may stack; and record its path and Git
reference in the Issue, naming the design pull request by number. Only once it is durably
reachable through Git and present in the later implementation worktree is implementation unblocked
on the design artifact. Until then, refinement is complete but implementation is blocked: the Issue
may carry `Approved design pending durable Git reference.` until the real path replaces it. State
that dependency; do not copy or recreate the artifact.

Do not add a renderer, component library, generator, parser, manifest, token-sync layer, preview
pipeline, or design versioning scheme. A text editor and a browser are the whole toolchain.
