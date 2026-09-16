#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatEntry } from "./format.mjs";
import { addEntry, markRead } from "./library.mjs";

const dataPath = resolve(process.env.READING_LIST_FILE ?? ".reading-list.json");

function load() {
  if (!existsSync(dataPath)) return [];
  const value = JSON.parse(readFileSync(dataPath, "utf8"));
  if (!Array.isArray(value)) throw new Error("reading-list data must be an array");
  return value;
}

function save(entries) {
  writeFileSync(dataPath, `${JSON.stringify(entries, null, 2)}\n`);
}

function usage() {
  return "Usage: reading-list <add <title>|list|read <id>>";
}

export function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  const entries = load();
  if (command === "add" && rest.length > 0) {
    const updated = addEntry(entries, rest.join(" "));
    save(updated);
    return `Added ${updated.at(-1).id}`;
  }
  if (command === "list" && rest.length === 0) {
    return entries.map(formatEntry).join("\n");
  }
  if (command === "read" && rest.length === 1) {
    save(markRead(entries, rest[0]));
    return `Marked ${rest[0]} read`;
  }
  throw new Error(usage());
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    process.stdout.write(`${main()}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
