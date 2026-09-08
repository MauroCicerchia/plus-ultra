Benchmark protocol: `fast-whitespace-tdd-v1`.

Treat this as a localized FAST correction. `normalizeTitle` in `src/format.mjs` collapses repeated
ASCII spaces but leaves tabs and newlines in titles. Apply TDD within only these two files:
`test/format.test.mjs` and `src/format.mjs`.

Add a failing focused test first, run it and observe the intended failure, then minimally make all
runs of whitespace collapse to one ASCII space. The exact behavioral example is
`normalizeTitle("  The\t Left\nHand  ") === "The Left Hand"`. Run
`node --test test/format.test.mjs` and `node scripts/check-postcondition.mjs fast`. Do not edit any
other file, invoke `gh`, access a network, commit, push, merge, release, or tag.
