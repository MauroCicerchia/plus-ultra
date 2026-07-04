---
name: engineering-principles
description: Use when designing, scaffolding, implementing, or reviewing TypeScript application code where hexagonal architecture, functional programming, domain boundaries, ports, adapters, or side-effect isolation are relevant.
---

# plus-ultra engineering principles

Use hexagonal architecture and functional programming when they make the code easier to test,
change, and reason about. These are defaults, not ceremony: keep the boundary when the code has
business rules or external integrations; keep tiny scripts and one-off glue simple.

## Hexagonal Architecture

Apply the dependency rule: source code points inward.

```
domain <- application <- adapters/http/db/ui/cli
```

- `domain` contains business types, pure rules, and invariants. It must not import frameworks,
  database clients, HTTP libraries, environment helpers, filesystem APIs, or UI code.
- `application` contains use cases. It coordinates domain behavior through explicit inputs and
  output ports. It may depend on `domain` and `ports`, not concrete adapters.
- `ports` define interfaces for external capabilities: repositories, clocks, id generators,
  mailers, queues, gateways, and telemetry.
- `adapters` implement ports with real tools such as Drizzle, Neon, Hono, browser APIs, or third
  party SDKs.
- `http`, `ui`, and `cli` translate transport details into application calls. Keep validation,
  auth extraction, status codes, and serialization there; keep business decisions out.

## Functional Programming Defaults

- Prefer pure functions for domain logic: explicit arguments in, explicit result out.
- Keep data immutable by default; return new values instead of mutating caller-owned objects.
- Model expected failures with typed results or discriminated unions instead of throwing across
  application boundaries.
- Inject side-effecting capabilities through ports. Pass clocks, IDs, persistence, and network
  clients in from the outside.
- Compose small functions before adding classes. Use classes only when they represent a stateful
  adapter or a framework requires them.

## TypeScript Shape

For the default API package, start with this layout:

```
src/
  domain/
  application/
  ports/
  adapters/
  http/
```

Use cases should be easy to test without Hono, Drizzle, network calls, or a real database. A good
test can call the application function with in-memory port implementations and assert the returned
result plus port calls.

## Review Checklist

- Domain/application code has no outward imports to frameworks or infrastructure.
- Business rules are not hidden in route handlers, React components, SQL builders, or SDK wrappers.
- Side effects are isolated behind ports and called from the application layer.
- Tests cover the functional core without real HTTP, database, filesystem, or network dependencies.
- Any deviation is intentional and documented in the spec or PR.
