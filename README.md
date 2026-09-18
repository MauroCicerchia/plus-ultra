# plus-ultra

A small harness for turning a product idea into GitHub Issues, and each Issue into a tested pull
request that a human merges.

It does not reinvent a methodology. [Superpowers](https://github.com/obra/superpowers) supplies the
reasoning loop — brainstorming, planning, TDD, systematic debugging, verification — and your coding
agent already knows how to write code. Plus Ultra adds the five steps around that, and a small set
of guardrails derived from mistakes that actually happened.

```
Idea → new-project → product → roadmap → refine-issue → implement-issue → reviewed PR → you merge
```

## The five capabilities

| Capability | What it does |
| --- | --- |
| `plus-ultra:new-project` | Runs discovery, records the approved brief and design brief, and initializes a repository — from the canonical template when the product is compatible with it |
| `plus-ultra:product` | Owns `docs/product.md` — the approved statement of what is being built |
| `plus-ultra:roadmap` | Turns product direction into GitHub Epics and Stories |
| `plus-ultra:refine-issue` | Makes one Issue ready to implement: ambiguity, acceptance criteria, UI direction |
| `plus-ultra:implement-issue` | Takes that Issue to a tested pull request, then stops |

The daily unit of work is a GitHub Issue. For an ordinary Story the whole instruction is:

```text
Implement Issue #123 end to end.
```

## Human checkpoints

Plus Ultra maximizes autonomy between checkpoints rather than maximizing checkpoints. Four decisions
stay yours:

1. **Product direction** — when a decision changes what is being built.
2. **Significant UI/UX direction** — before an agent invents an interface. For a product with a
   real interface, that starts with one approved root `DESIGN.md`.
3. **Material unresolved ambiguity** — product, UX, security, data, contract, or anything else
   externally observable that the agent cannot settle from context.
4. **Final review and merge** — always manual.

Everything else runs autonomously unless evidence forces an escalation. A normal Story has at most
two checkpoints before the final PR review.

## Install

### Codex

```
codex plugin marketplace add maurocicerchia/plus-ultra --ref main
codex plugin add plus-ultra@plus-ultra
```

To update, run `codex plugin marketplace upgrade plus-ultra`, then run
`codex plugin add plus-ultra@plus-ultra` again.

### Claude Code

```
claude plugin marketplace add maurocicerchia/plus-ultra
claude plugin add plus-ultra@plus-ultra
```

To update, run `claude plugin marketplace update plus-ultra`, then
`claude plugin update plus-ultra@plus-ultra`.

### Cursor

Refresh or reinstall Plus Ultra from the Cursor marketplace. Cursor has no documented CLI command
for this workflow, so the marketplace UI remains the supported path.

Superpowers is declared as a dependency and installed automatically from the same marketplace.

Requires **GitHub CLI 2.94.0 or newer**; workflows check `gh --version` and stop with a clear
message below it.

## Getting started

### A new product

```text
Use plus-ultra:new-project to start a project for [describe the idea].
```

Discovery runs first. Nothing is written until you approve `docs/product.md`. If the product has a
real user interface, a short design conversation follows and produces an approved root `DESIGN.md`
in the [Google Labs `DESIGN.md` format](https://github.com/google-labs-code/design.md): durable
visual direction that later refinement and implementation build against, readable by any agent that
already speaks the convention. Products without a UI skip it entirely. Refinement can later propose a change to that direction, but only as an
explicit decision you approve — never as a side effect of building a feature. Then the repository is initialized, and `plus-ultra:roadmap` breaks the
direction into Epics and Stories.

### An existing repository

Skip straight to the Issue. Refine it when it is vague, or hand it to implementation when it is
already clear:

```text
Use plus-ultra:refine-issue for Issue #123.
Use plus-ultra:implement-issue for Issue #123.
```

`docs/product.md` is optional. A repository without one works normally and never gains one
implicitly.

## How implementation decides

`implement-issue` picks a depth for each Issue instead of applying one ceremony to everything:

| Depth | When | What it does |
| --- | --- | --- |
| Small | Localized and understood; no material decision | Implement, focused tests, PR |
| Normal | Significant behaviour, or several files | Short plan, tests, review when warranted, PR |
| High-risk | Auth, payments, destructive data, migrations, concurrency, critical infrastructure | Written contract, stronger verification, mandatory independent review, PR |

A separate `specs/NNN-slug.md` is written only when a durable technical decision has to exist before
the code does. A refined Issue is the contract for everything else.

## Guardrails

Deterministic, cheap, and each one derived from a real failure. On Claude Code and Codex these run
as lifecycle hooks; Cursor receives the portable policy as documentation.

- **Integration boundary** — blocks autonomous merges, auto-merge, default-branch pushes, releases,
  and tags, including through `gh api`, GraphQL, and shell wrappers.
- **Dangerous commands** — blocks recursive force-deletes and force-pushes to shared branches.
- **Secret scan** — blocks commits with credentials in the staged diff.
- **Commit gate** — blocks a commit unless this session has a passing test run, and a passing
  typecheck in TypeScript projects, against the current working tree. Prose-only changes are not
  gated.
- **Commit message lint** — enforces Conventional Commits, which drive releases.
- **Auto-format** — runs the project's formatter on edited files.

The rule the whole harness serves: **the agent finishes at a pull request that is ready for review;
you merge it.**

## Maintaining this repository

See the [maintainer guide](docs/maintainer-guide.md) for layout, validation commands, and
platform-specific details.
