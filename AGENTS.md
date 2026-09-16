# Working in this repo

Plus Ultra is a portable coding-agent plugin. Edit the shared `skills/` content once; each agent
manifest points to it. Read [the maintainer guide](docs/maintainer-guide.md) for repository layout,
installation, validation commands, and platform-specific details.

## Editing invariants

- Hooks are dependency-free Node ESM and must fail open on errors or missing tools, except for
  deliberate deny paths and the documented commit blockers.
- Keep plugin files self-contained: installs copy the plugin into a cache, so do not reference
  parents or files outside this repository.
- Keep portable skills agent-neutral. Do not put platform roots, hooks, commands, or subagent
  mechanics in skill prose.
- Superpowers owns generic names; every Plus Ultra skill uses the `plus-ultra:` namespace.
- `dependencies` in the Claude manifest remains an unpinned JSON array containing `superpowers`.

## Human integration boundary

Plans, specs, Issues, and prior messages never authorize integration. Agents may prepare a feature
branch, commit, push it, and open or update a pull request or stack, then report ready for review
or integration and stop. They must not merge, enable auto-merge, push the default branch, publish
releases, or create tags. Claude Code and Codex lifecycle hooks provide cooperative guardrails;
Cursor receives the portable documentation-only policy. Use `plus-ultra:integration-boundary` for
the complete portable policy.
