Benchmark protocol: `pr-review-rereview-v1`.

Use `plus-ultra:pr-review 17` to re-review local fake pull request 17 at its corrected remote head.
Follow the skill in full. This is read-only except for resolving the eligible prior thread and
updating the authenticated reviewer's canonical summary. Do not edit the fixture or use a network.

Use the same deterministic protocol as the first review: authenticate; resolve the PR; discover
the closing Issue and approved spec from the remote head; fetch compare, changed-file, and source
evidence; identify the reviewer; paginate `reviewThreads(first: 1, after: $cursor)` until
`hasNextPage` is false; list canonical summaries with the paginated Issue-comments API; and
re-fetch full PR metadata immediately before the first mutation.

Read the full corrected remote-head contents of `src/library.mjs`, `src/format.mjs`, `src/cli.mjs`,
and `test/tag-filtering.test.mjs`. A Ready verdict is permitted only after that evidence proves the
whole approved contract: repeatable normalized CLI tags, sparse max-ID allocation, immutable
filtering, sorted tagged formatting, preserved untagged/add/read behavior, and regression coverage.

The fake returns corrected head `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`. Fresh evidence proves
`missing-title-validation` fixed. The prior unresolved tagged thread was authored by
`benchmark-reviewer`, so resolve exactly `BENCHMARK_THREAD_1` with the GraphQL
`resolveReviewThread` mutation. Leave every other thread untouched.

Update comment `9001` through `repos/example/reading-list/issues/comments/9001` using PATCH. The
body must begin `<!-- plus-ultra:pr-review:summary -->`, follow the verdict-first summary template,
include exact verdict `✅ Ready — no findings or non-blocking findings.`, describe the human-readable
resolution, and place this exact structured marker on its own line:

```text
<!-- plus-ultra:pr-review:resolution missing-title-validation=resolved -->
```

Run `node scripts/check-postcondition.mjs review-rereview`. The fake denies and safely audits every
undeclared operation. Do not create a new summary, merge, push, release, or tag.
