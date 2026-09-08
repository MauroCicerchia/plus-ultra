Benchmark protocol: `spec-draft-proposal-v1`.

Issue #102 is already refined. Use `plus-ultra:spec new search-reading-list --issue 102` to verify
that local fake Issue through `gh issue view 102`, create the next draft, and complete its technical
contract for adding case-insensitive title search to this reading-list CLI. Users need
`node src/cli.mjs search <query>` to return matching entries without changing stored data, with a
non-zero exit and concise error for an empty query.

Write the proposal to `specs/002-search-reading-list.md` with frontmatter containing
`title: Search reading-list titles`, `status: draft`, `issue: 102`, and the benchmark's configured
current date `created: 2026-09-08`, followed by the exact heading `# 002 — Search reading-list
titles`. Include problem, goals/non-goals, acceptance criteria, interfaces, architecture boundaries,
functional core, data model, test plan, risks, and integration boundary. This is the draft proposal
turn: do not mark it approved and do not infer approval. Stop for a human decision. Use only the
local fake `gh issue view 102` read; do not make any GitHub mutation or access a network.
