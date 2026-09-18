---
name: new-project
description: Use when starting a new product from an incomplete idea — runs product discovery, records the approved brief, and initializes a repository that is ready for roadmap work.
---

# Start a new project

## 1. Product discovery

A greenfield project without `docs/product.md` is product work before it is engineering work.
Invoke `plus-ultra:product` for initial discovery and wait for explicit human approval of the brief.

Do not choose a stack, create files, or run an init command before that approval. If
`docs/product.md` already exists, read it as approved context and continue.

## 2. Design discovery, only for a product with a real interface

Judge from the approved brief whether the product has a meaningful user interface. A library, CLI,
service, or data pipeline does not: skip this step and load nothing for it.

When it does, hold a short adaptive conversation about durable visual direction and produce one
human-approved `DESIGN.md` at the repository root. Follow
[`references/design-brief.md`](./references/design-brief.md), which is the only place this material
lives. Feature-specific UI stays where it already is, in the Issue design checkpoint.

## 3. Judge the canonical template

From the approved brief, settle the project name and the kind of application, then judge whether the
canonical Plus Ultra template substantially fits the product. Follow
[`references/canonical-template.md`](./references/canonical-template.md) for the fit verdicts and
the instantiation and adaptation procedure.

For a compatible product the template is **the default, not an opt-in**: never ask whether to use
it, and never make the human re-select a default it owns. Explicit human technology choices always
win, and an isolated mismatch is adapted rather than grounds for starting over. Ask only about a
material choice that remains open.

## 4. Initialize the repository

**Template fit, whole or partial.** Instantiate it with fresh history into the root that already
holds the approved context, customize it for this product, replace or remove only the pieces that
genuinely do not fit, and name each one.

**Fundamental mismatch.** Say why the template was skipped, then initialize directly with the
smallest thing that can run and be tested, and leave every decision the product does not yet need —
database, deployment target, architecture layering — unmade. Give it:

- a package manifest with `test`, `lint` or `format`, and (for typed languages) `typecheck` scripts;
- a test runner with one real passing test;
- a formatter or linter with its configuration;
- a CI workflow that installs, then runs those same scripts;
- a `README.md` stating what the product is, taken from the brief.

**Either way**, the repository ends holding a short `AGENTS.md` pointing at `docs/product.md` and
the conventions below, a `.gitignore` containing `/.context/`, and the approved `DESIGN.md` at the
root, when step 2 produced one. Follow `plus-ultra:conventions` for artifact locations and the
first commit message.

## 5. Verify, then stop before the remote

Install dependencies, then run every verification script the project exposes and confirm each exits
zero. On the canonical template that is `typecheck`, `test`, `lint`, and `build`; a direct bootstrap
runs whichever of those its own baseline actually defines. Fix what fails first. Make the first
commit locally.

**Stop there.** Publishing a new repository means pushing its initial default branch, and
`plus-ultra:integration-boundary` reserves default-branch pushes for a human. That applies however
the push is spelled, including `gh repo create --push` and any flag that publishes while creating.
Do not look for a bootstrap exception; there is none.

Report the local repository path, whether the template was used, adapted, or skipped and why, what
was left out, and the exact commands the human runs to create the remote and push the first branch.
Once the remote exists, point them at `plus-ultra:roadmap` for the first Epics and Stories.
