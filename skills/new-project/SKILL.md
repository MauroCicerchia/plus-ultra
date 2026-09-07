---
name: new-project
description: Scaffold a new project with the plus-ultra default stack — a pnpm-workspaces monorepo with a React + Vite web app, a Hono API, a shared zod/types package, Biome, vitest, and CI. Use when starting a new repo, bootstrapping an app, or asked to "set up a project" without a stack specified. Reads plus-ultra:tech-stack for the picks.
---

# plus-ultra new project scaffold

Bootstraps the `plus-ultra:tech-stack` defaults. Confirm the stack with the user first if they
haven't stated one — this skill fills silence, it doesn't override stated preferences.

## Product discovery gate

Before stack selection or scaffolding, identify whether this is greenfield work. For a greenfield
project missing `docs/product.md`, invoke `$product-discovery` for initial adaptive discovery;
explicit human approval of its proposed brief is required before stack selection or scaffolding.
When `docs/product.md` exists, read the approved brief as product context; it informs stack and
scaffolding decisions without changing the brief.

An existing repository without a brief remains compatible: continue normally and never create,
edit, write, or mutate `docs/product.md` implicitly. If proposed scaffolding creates a durable
contradiction with a present brief, pause the current workflow, invoke `$product-discovery` for a
focused rediscovery update; only after its explicit human approval, resume the current workflow.

## Before scaffolding

- Confirm project name and whether they want the full **monorepo** (default) or a **single package**
  (throwaway / single-surface). Everything below assumes the monorepo.
- Check companion capabilities before using stack-specific workflows. Prefer:
  - `plus-ultra:engineering-principles` for hexagonal architecture and functional programming
    defaults when the project has business rules or external integrations.
  - `frontend-design` for the web app's visual direction.
  - `shadcn` or a shadcn MCP for component docs, registry lookup, and component installation.
  - `vercel-react-best-practices` for React rendering, data-fetching, bundle, and runtime
    performance guidance.
  - `vercel-composition-patterns` for reusable React component API design.
  - `vitest` for Vitest-specific test design, mocking, configuration, debugging, and reliability.
  - `playwright-best-practices` only if the user selects Playwright or the project already uses it
    for browser E2E tests.
  - `gh-cli` with the `gh` CLI for GitHub setup and PR/release workflows.
  - Neon skills or MCPs for Neon project setup, `DATABASE_URL`, branching, and connection guidance.
  If a companion is unavailable, do not block scaffolding; say what is missing and fall back to
  official docs or plain CLI commands. Companions are optional advisors: do not install them or add
  their associated libraries unless the user asks.
- Fetch current setup commands/versions via Context7 before running init commands — don't rely on
  memorized CLI flags for Vite, Hono, Drizzle, Biome, etc.

## Target layout

```
.
├── package.json            # workspace root: scripts, devDeps (biome, typescript, vitest)
├── pnpm-workspace.yaml      # packages: apps/*, packages/*
├── biome.json               # one config for lint + format
├── tsconfig.base.json       # strict base extended by each workspace
├── .github/workflows/ci.yml # from this skill's assets/ci.yml
├── apps/
│   ├── web/                 # React + Vite + React Router + Tailwind + shadcn/ui
│   └── api/                 # Hono server + hexagonal core + Drizzle (Neon Postgres)
└── packages/
    └── shared/              # zod schemas + types imported by BOTH apps
```

## Steps

1. **Root workspace** — `package.json` (private, `packageManager: pnpm@…`), `pnpm-workspace.yaml`
   listing `apps/*` and `packages/*`. Root scripts delegate with `pnpm -r`:
   `typecheck` (`tsc --noEmit` per workspace), `test` (`vitest run`), `lint`/`format` (Biome).
2. **`tsconfig.base.json`** — `strict: true`, `moduleResolution: bundler`, `noUncheckedIndexedAccess`.
   Each workspace extends it.
3. **`packages/shared`** — export zod schemas + inferred types. This is the front↔back contract.
4. **`apps/api`** — Hono app around a hexagonal, functional core. Use:
   - `src/domain` for pure business types, rules, and invariants.
   - `src/application` for a pure use case layer that coordinates domain logic through ports.
   - `src/ports` for repository, clock, ID, queue, gateway, and telemetry interfaces.
   - `src/adapters` for Drizzle, Neon, SDK, filesystem, and network implementations.
   - `src/http` for Hono routes, validation, auth extraction, status codes, and serialization.
   Validate request bodies with the shared zod schemas; **export the app type** for RPC. Drizzle
   schema + `@neondatabase/serverless` connection stay in adapters. Keep domain/application imports
   inward: no Hono, Drizzle, React, environment helpers, filesystem APIs, or network clients.
5. **`apps/web`** — Vite + React + React Router; Tailwind + shadcn/ui; typed API calls via Hono's
   `hc<AppType>` client. Apply `frontend-design` for the visual layer when available. Use shadcn
   companion tooling for docs/examples/registry operations when available; otherwise use the shadcn
   CLI and official docs directly. When available, use `vercel-react-best-practices` for React
   performance-sensitive implementation and review, and `vercel-composition-patterns` when shaping
   reusable component APIs.
6. **Biome** — `biome.json` at root; wire the plus-ultra `auto-format` hook's tool (it runs
   `biome check --write` on edited files).
7. **Testing** — configure Vitest for unit and integration tests; use the optional `vitest`
   companion when present for framework-specific setup, mocking, debugging, and reliability.
   Add Playwright browser E2E only when the user requests it; if selected and
   `playwright-best-practices` is available, use it for locators, isolation, fixtures, and CI.
8. **CI** — copy [`assets/ci.yml`](./assets/ci.yml) to `.github/workflows/ci.yml` (install → Biome
   ci → typecheck → test). Extend it with browser E2E only if Playwright was selected.
9. **Repo conventions** — create `specs/` and `docs/` per `plus-ultra:spec-conventions`; add a
   `.gitignore` covering `node_modules`, `dist`, `.env*` (keep `.env.example`), plus root-anchored
   entries `/.context/` and `/docs/superpowers/`.
10. **Agent setup note** — if the repo will be used by coding agents, add a short `AGENTS.md` or
   `docs/agent-setup.md`. State that transient workflow artifacts go in `.context/superpowers/`,
   durable specs go in `specs/`, and durable project documentation goes in `docs/`. State that
   trivial changes may skip standalone design and plan artifacts. Also name the recommended optional
   companions (`frontend-design`,
   `shadcn`, `vercel-react-best-practices`, `vercel-composition-patterns`, `vitest`,
   `playwright-best-practices`, `gh-cli`, Neon skills/MCPs) without requiring them for normal
   development.

## API shape

Use this structure for non-trivial APIs:

```
apps/api/src/
  domain/
  application/
  ports/
  adapters/
  http/
```

The initial example should include one pure use case that accepts explicit input plus injected
ports and returns a typed result. Route handlers should translate HTTP details into that use case.
Repository adapters should implement ports and be replaceable by in-memory fakes in unit tests.

## After scaffolding

- Verify: `pnpm install`, then `pnpm -r typecheck` and `pnpm -r test` exit 0 (also satisfies the
  commit-gate before the first commit).
- First commit uses `plus-ultra:conventional-commits` (e.g. `chore: scaffold monorepo`).
