---
name: tech-stack
description: The default technology stack for new projects in this harness — a TypeScript-everywhere React + Hono monorepo. Use when starting a new project, scaffolding an app, choosing a framework/library/tool, or when a decision needs a sensible default. States the picks and, for each, when to deviate. Superpowers owns the methodology; this skill owns the defaults.
---

# plus-ultra default tech stack

Opinionated defaults so a new project starts without re-litigating tooling. **TypeScript on both
ends, React on the front, Hono on the back, one monorepo, types shared across the boundary, and
hexagonal architecture around a functional core where application complexity justifies it.**

These are defaults, not laws. Each row says when to deviate. If the user names a different tool,
follow the user — this skill only fills silence.

## The stack

| Layer | Default | Deviate when |
|---|---|---|
| Repo | **pnpm workspaces monorepo** | truly single-surface throwaway → single package |
| Language | **TypeScript, `strict: true`**, both ends | never (this harness is TS-first) |
| Frontend build | **Vite** | — |
| UI framework | **React** | — |
| Routing | **React Router** | app is a single view |
| Styling | **Tailwind CSS** | design system mandates otherwise |
| Components | **shadcn/ui** | need a heavier component lib (MUI, etc.) |
| Design guidance | **`frontend-design` skill** | — |
| Backend framework | **Hono** | need Fastify's plugin ecosystem / pure-Node middleware |
| Front↔back types | **Hono RPC** (`hc` client) | GraphQL surface → codegen instead |
| Validation | **zod**, schemas in `packages/shared` | — |
| Database | **Neon Postgres** | local-only / embedded → SQLite |
| ORM / query | **Drizzle** | raw SQL is genuinely simpler |
| Tests | **vitest** | — |
| Lint + format | **Biome** (one tool, replaces eslint + prettier) | a required plugin only exists for eslint |
| Package manager | **pnpm** | — |
| Deploy | **Vercel** (web) + **Fly/Railway** (api) | — |

## Monorepo layout

```
apps/web           React + Vite + React Router + Tailwind + shadcn/ui
apps/api           Hono server
packages/shared    zod schemas + types imported by BOTH apps
```

In `apps/api`, use `plus-ultra:engineering-principles` when business logic or infrastructure
integration is involved. Default to a functional core with hexagonal boundaries:

```
apps/api/src/domain       pure business types, rules, invariants
apps/api/src/application  use cases that coordinate domain logic through ports
apps/api/src/ports        interfaces for persistence, clocks, IDs, queues, gateways
apps/api/src/adapters     concrete Drizzle/Neon/SDK implementations of ports
apps/api/src/http         Hono routes, validation, auth extraction, serialization
```

The dependency rule is inward only: domain/application code must not import Hono, Drizzle, React,
environment helpers, filesystem APIs, or network clients. Expected failures should be modeled with
typed results or discriminated unions. Side effects belong behind ports and adapters.

The point of TypeScript-on-both-ends is the shared boundary: **define a shape once as a zod schema
in `packages/shared`**, and both the API (validate input) and the web app (typed fetch via Hono RPC)
consume it. No duplicated types, no drift. If you find yourself writing the same interface twice,
move it to `packages/shared`.

## How it connects

- **Hono RPC** — export the Hono app's type from `apps/api`, import it in `apps/web` with `hc<AppType>`.
  The frontend gets fully-typed routes and payloads with zero codegen.
- **zod** — every API boundary (request body, params, response) is a zod schema in `packages/shared`.
  Hono validates with it server-side; the web app infers types from it client-side.
- **Drizzle + Neon** — Drizzle schema lives in `apps/api`; use `@neondatabase/serverless` for the
  connection so it works on serverless/edge runtimes.
- **Functional core** — application use cases accept data plus ports and return explicit results.
  Hono routes and Drizzle repositories adapt external details to that core.

## Companion capabilities

These are recommended helpers, not plus-ultra dependencies. Use them when available; if they are
missing, continue with official docs and CLI commands.

- **`frontend-design`** — apply when creating or reshaping the web app's visual layer.
- **`shadcn` / shadcn MCP** — use for component docs, registry lookup, examples, and safe component
  installation.
- **`vercel-react-best-practices`** — apply to React implementation and review when rendering,
  data fetching, bundle size, or runtime performance matters.
- **`vercel-composition-patterns`** — apply when designing reusable React component APIs or
  refactoring components overloaded with boolean props.
- **`vitest`** — apply for Vitest-specific test design, mocking, configuration, debugging, and
  suite reliability. Superpowers still owns the test-first workflow.
- **`playwright-best-practices`** — apply only when the user selects Playwright or the project
  already contains Playwright browser E2E tests. It does not make Playwright a stack dependency.
- **`gh-cli`** — use with the `gh` CLI for GitHub issues, PRs, Actions, releases, and repository
  operations.
- **Neon skills / MCPs** — use for Neon project setup, database URLs, branching, and connection
  guidance.

These companions are technology-specific advisors. They do not replace Superpowers' methodology,
`plus-ultra:engineering-principles`, or the user's explicit choices, and their absence must not
block normal work.

## Fit with the rest of plus-ultra

- `plus-ultra:new-project` scaffolds this layout.
- `plus-ultra:engineering-principles` defines the architecture and functional programming defaults
  for non-trivial application code.
- The `auto-format` hook runs **Biome** on edited files — matches this stack's lint/format pick.
- The `commit-gate` hook requires a passing **vitest** run (and a `tsc` typecheck in TS projects)
  before commit.
- `plus-ultra:spec-conventions` governs where specs and ADRs live.
