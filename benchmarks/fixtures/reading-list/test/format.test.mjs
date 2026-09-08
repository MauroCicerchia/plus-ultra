import assert from "node:assert/strict";
import test from "node:test";

import { formatEntry, normalizeTitle } from "../src/format.mjs";

test("normalizes surrounding and repeated spaces", () => {
  assert.equal(normalizeTitle("  The  Dispossessed  "), "The Dispossessed");
});

test("formats unread and read entries", () => {
  assert.equal(formatEntry({ id: 1, title: "Dune", read: false }), "[ ] 1 Dune");
  assert.equal(formatEntry({ id: 1, title: "Dune", read: true }), "[x] 1 Dune");
});
