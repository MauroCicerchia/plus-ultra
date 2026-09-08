import assert from "node:assert/strict";
import test from "node:test";

import { addEntry, markRead } from "../src/library.mjs";

test("adds immutable entries with sequential identifiers", () => {
  const original = [{ id: 2, title: "Dune", read: false }];
  const updated = addEntry(original, "  Kindred ");

  assert.deepEqual(updated, [
    { id: 2, title: "Dune", read: false },
    { id: 3, title: "Kindred", read: false },
  ]);
  assert.notEqual(updated, original);
});

test("marks one entry read without mutating the input", () => {
  const original = [{ id: 1, title: "Dune", read: false }];
  assert.deepEqual(markRead(original, "1"), [{ id: 1, title: "Dune", read: true }]);
  assert.equal(original[0].read, false);
});
