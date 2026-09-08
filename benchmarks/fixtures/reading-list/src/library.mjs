import { normalizeTitle } from "./format.mjs";

export function addEntry(entries, title) {
  const normalized = normalizeTitle(title);
  if (!normalized) throw new Error("title is required");
  const nextId = entries.reduce((largest, entry) => Math.max(largest, entry.id), 0) + 1;
  return [...entries, { id: nextId, title: normalized, read: false }];
}

export function markRead(entries, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) throw new Error("id must be an integer");
  let found = false;
  const updated = entries.map((entry) => {
    if (entry.id !== numericId) return entry;
    found = true;
    return { ...entry, read: true };
  });
  if (!found) throw new Error(`entry ${id} was not found`);
  return updated;
}
