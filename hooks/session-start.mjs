#!/usr/bin/env node
// SessionStart: scan specs/*.md frontmatter and report approved technical contracts
// so a session resumes without re-explaining context.
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

const frontmatterOf = (path) => {
  try {
    const text = readFileSync(path, "utf8");
    const fm = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm) return null;
    const statusMatch = fm[1].match(/^\s*status:\s*(?:"([a-z-]+)"|'([a-z-]+)'|([a-z-]+))\s*$/im);
    if (!statusMatch) return null;
    const status = statusMatch[1] ?? statusMatch[2] ?? statusMatch[3];
    const issueMatch = fm[1].match(/^\s*issue:\s*([^\r\n]+?)\s*$/im);
    const rawIssue = issueMatch?.[1];
    const issue = /^\d+$/.test(rawIssue ?? "") && Number(rawIssue) > 0 ? Number(rawIssue) : null;
    return { status: status.toLowerCase(), issue };
  } catch {
    return null;
  }
};

const buckets = { approved: [], draft: [], superseded: [] };
for (const f of files) {
  const frontmatter = frontmatterOf(`${specsDir}/${f}`);
  if (frontmatter && buckets[frontmatter.status]) buckets[frontmatter.status].push({
    file: f,
    issue: frontmatter.issue,
  });
}

const lines = [];
if (buckets.approved.length) {
  const displays = buckets.approved.map(({ file, issue }) =>
    issue ? `${file} (Issue #${issue})` : file
  );
  lines.push(`Approved (current technical contracts): ${displays.join(", ")}`);
}
if (buckets.draft.length) lines.push(`Drafts: ${buckets.draft.map(({ file }) => file).join(", ")}`);

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
