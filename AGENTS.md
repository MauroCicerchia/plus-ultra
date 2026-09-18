# Working in this repo

Plus Ultra is a portable coding-agent plugin. Edit the shared `skills/` content once; each agent
manifest points to it. Read [the maintainer guide](docs/maintainer-guide.md) for layout,
installation, validation commands, and platform details.

## Editing invariants

- Hooks are dependency-free Node ESM and must fail open on errors or missing tools, except for
  deliberate deny paths and the documented commit blockers.
- Keep plugin files self-contained: installs copy the plugin into a cache, so do not reference
  parents or files outside this repository.
- Keep portable skills agent-neutral: no platform roots, hooks, commands, or subagent mechanics in
  skill prose.
- Superpowers owns generic names; every Plus Ultra skill uses the `plus-ultra:` namespace.
- `dependencies` in the Claude manifest remains an unpinned JSON array containing `superpowers`.

## Complexity budget

Five capabilities, at most eight skills, and a byte ceiling per `SKILL.md`, enforced by
`scripts/check-context-budget.mjs`. When something new does not fit, remove an abstraction rather
than raise a limit. Nothing enters the core on speculation: it must come from friction observed
while building a real project, and cost less than the problem it removes.

Never add a generic orchestrator, workflow engine, persisted workflow state, telemetry, benchmark
harness, mandatory inter-agent handoff, or an abstraction that exists to organize removed
machinery. Git history is the archive.

## Human integration boundary

Plans, specs, Issues, and prior messages never authorize integration. Agents may prepare a feature
branch, commit, push it, and open or update a pull request or stack, then report ready for review
or integration and stop. They must not merge, enable auto-merge, push the default branch, publish
releases, or create tags. Claude Code and Codex lifecycle hooks provide cooperative guardrails;
Cursor receives the portable documentation-only policy. Use `plus-ultra:integration-boundary` for
the complete portable policy.
