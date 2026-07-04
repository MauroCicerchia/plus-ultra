#!/usr/bin/env node
// SessionStart: scan specs/*.md frontmatter and report which spec is in-progress
// (and what's next up) so a session resumes without re-explaining context.
// stdout is injected into the session context.
import { readdirSync, readFileSync } from "node:fs";
import { readInput, debug, isCodexInput, projectRoot } from "./_lib.mjs";

const input = await readInput();
debug("session-start", input);

const root = projectRoot(input);
const specsDir = `${root}/specs`;

let files;
try {
  files = readdirSync(specsDir).filter((f) => f.endsWith(".md")).sort();
} catch {
  process.exit(0); // no specs/ dir — nothing to report
}
if (files.length === 0) process.exit(0);

const statusOf = (path) => {
  try {
    const text = readFileSync(path, "utf8");
    const fm = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm) return null;
    const m = fm[1].match(/^\s*status:\s*["']?([a-z-]+)["']?\s*$/im);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

const buckets = { "in-progress": [], approved: [], draft: [], done: [] };
for (const f of files) {
  const s = statusOf(`${specsDir}/${f}`);
  if (s && buckets[s]) buckets[s].push(f);
}

const lines = [];
if (buckets["in-progress"].length)
  lines.push(`In progress: ${buckets["in-progress"].join(", ")}`);
if (buckets.approved.length) lines.push(`Approved (ready to start): ${buckets.approved.join(", ")}`);
if (buckets.draft.length) lines.push(`Drafts: ${buckets.draft.join(", ")}`);

if (lines.length) {
  const context = "plus-ultra spec status:\n" + lines.map((l) => `  - ${l}`).join("\n") + "\n";

  if (isCodexInput(input)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: context,
        },
      })
    );
  } else {
    process.stdout.write(context);
  }
}
process.exit(0);
