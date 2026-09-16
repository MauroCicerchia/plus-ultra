---
name: new-project
description: Scaffold a new project with the Plus Ultra default TypeScript stack when the user has not selected another stack. Use when bootstrapping a new app or repository.
---

# plus-ultra new project scaffold

Use the default stack only to fill an unstated preference; it never overrides an explicit user
choice. Confirm the project name and whether a full monorepo or a single package is intended.

## Product discovery gate

Before stack selection or scaffolding, treat a greenfield project missing `docs/product.md` as
product discovery work: invoke `$product-discovery` for initial adaptive discovery and require
explicit human approval before stack selection. When `docs/product.md` exists, read it as the approved brief and product context;
it informs stack selection and scaffolding. Read `docs/product.md` before scaffolding. An existing
repository without a brief remains compatible and must never gain one implicitly. A durable
contradiction pauses this workflow: invoke `$product-discovery` for a focused update; after explicit
human approval, resume. Never create, edit, write, or mutate `docs/product.md` here.

## Load the scaffold blueprint

Before choosing companion capabilities, fetching current setup commands, creating the workspace,
or verifying the result, read
[`references/scaffold-blueprint.md`](./references/scaffold-blueprint.md). It contains the default
layout, package and architecture boundaries, optional companion guidance, CI template, transient
artifact rules, and exact verification steps. Use only the sections needed for the chosen scope.
