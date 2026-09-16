Benchmark protocol: `pr-review-first-v1`.

Use `plus-ultra:pr-review 17` to review local fake pull request 17 against its approved remote-head
contract. Follow the skill in full. This is read-only except for the declared inline finding and
canonical summary mutations. Do not edit the fixture or use a network.

The deterministic fake supports the workflow's required operations:

- `gh auth status`, `gh pr view 17`, closing-Issue and full metadata JSON requests;
- remote-head `contents/specs`, spec content, source content, compare, and changed-files API reads;
- `gh api user` and GraphQL `reviewThreads(first: 1, after: $cursor)` reads;
- paginated Issue-comment discovery through
  `gh api --paginate repos/example/reading-list/issues/17/comments?per_page=100`;
- REST creation of a current-head inline comment and canonical Issue-comment summary.

Use owner `example`, repository `reading-list`, and page size 1 for review threads. The fake returns
the immutable blocked head `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`. Re-fetch full PR metadata
immediately before the first mutation. The evidence exposes `missing-title-validation` at added
right-side `src/library.mjs:5`.

Create exactly one inline comment through
`repos/example/reading-list/pulls/17/comments`, with the current `commit_id`, path, line, `side:
RIGHT`, and a body beginning `<!-- plus-ultra:pr-review:inline -->`. Then create the canonical
summary through `repos/example/reading-list/issues/17/comments`; its body must begin
`<!-- plus-ultra:pr-review:summary -->`, use the documented verdict-first template, include the
exact verdict `⛔ Changes required — one or more blockers.`, and describe the blocker.

Run `node scripts/check-postcondition.mjs review-first`. The fake denies and safely audits every
undeclared operation. Do not resolve a thread, merge, push, release, or tag.
