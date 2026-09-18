---
name: new-project
description: Use when starting a new product from an incomplete idea — runs product discovery, records the approved brief, and initializes a repository that is ready for roadmap work.
---

# Start a new project

Turn an incomplete idea into a repository that is ready to plan work in. Three steps, in order:
discovery, then the approved brief, then a working repository.

## 1. Product discovery

A greenfield project without `docs/product.md` is product work before it is engineering work.
Invoke `plus-ultra:product` for initial discovery and wait for explicit human approval of the brief.

Do not choose a stack, create files, or run an init command before that approval. If
`docs/product.md` already exists, read it as approved context and continue.

## 2. Decide only what the first commit needs

From the approved brief, settle the project name, the kind of application, and the language or
runtime. Ask about anything else only when the answer changes the first commit.

Explicit user choices always win. Where the user has no opinion, prefer the smallest thing that can
run and be tested, and leave every decision the product does not yet need — database, deployment
target, architecture layering, component library — unmade. Adding these later is cheap; removing an
unnecessary framework from a young codebase is not.

## 3. Initialize the repository

Create the workspace and give it a baseline a coding agent and a CI run can both work with:

- a package manifest with `test`, `lint` or `format`, and (for typed languages) `typecheck` scripts;
- a test runner with one real passing test;
- a formatter or linter with its configuration;
- a CI workflow that installs, then runs those same scripts;
- a `README.md` stating what the product is, taken from the brief;
- a short `AGENTS.md` pointing at `docs/product.md` and the conventions below;
- a `.gitignore` that includes `/.context/`.

Fetch current setup commands from the tools' own documentation rather than recalling flags. Follow
`plus-ultra:conventions` for artifact locations and the first commit message.

A canonical Plus Ultra template repository will replace this step in a later iteration; until then,
build the baseline with your own judgment and keep it minimal.

## 4. Verify, then stop before the remote

Install, then run the project's own test and typecheck scripts and confirm they exit zero. Make the
first commit locally.

**Stop there.** Publishing a new repository means pushing its initial default branch, and
`plus-ultra:integration-boundary` reserves default-branch pushes for a human. That applies however
the push is spelled, including `gh repo create --push` and any flag that publishes while creating.
Do not look for a bootstrap exception; there is none.

Report the local repository path, the stack chosen, what was deliberately left out, and the exact
commands the human runs to create the remote and push the first branch. Once the remote exists,
point them at `plus-ultra:roadmap` for the first Epics and Stories.
