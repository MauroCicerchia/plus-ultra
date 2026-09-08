export function normalizeTitle(value) {
  if (typeof value !== "string") throw new TypeError("title must be a string");
  return value.trim().replace(/ {2,}/g, " ");
}

export function formatEntry(entry) {
  return `${entry.read ? "[x]" : "[ ]"} ${entry.id} ${entry.title}`;
}
