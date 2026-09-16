import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main as reducerMain } from "../scripts/context-reducers.mjs";
import {
  compactPrSnapshot,
  compactReviewState,
  indexSpecs,
  resolveContract,
} from "../scripts/context-reducers/core.mjs";

const repository = "example/reading-list";
const headOid = "a".repeat(40);
const reducerCli = new URL("../scripts/context-reducers.mjs", import.meta.url).pathname;

function fakeGhDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "plus-ultra-context-reducers-"));
const source = `#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const json = (value) => process.stdout.write(JSON.stringify(value));
const head = ${JSON.stringify(headOid)};
const truncatedComparison = process.env.PLUS_ULTRA_CONTEXT_REDUCER_TRUNCATED_COMPARE === "1";
const repeatedThreadCursor = process.env.PLUS_ULTRA_CONTEXT_REDUCER_REPEATED_THREAD_CURSOR === "1";
const nextPrHead = () => {
  if (process.env.PLUS_ULTRA_CONTEXT_REDUCER_HEAD_DRIFT !== "1") return head;
  const path = process.env.PLUS_ULTRA_CONTEXT_REDUCER_GH_CALLS;
  const calls = path && existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;
  if (path) writeFileSync(path, String(calls + 1));
  return calls === 0 ? head : "${"b".repeat(40)}";
};
const nextPrBase = () => {
  if (process.env.PLUS_ULTRA_CONTEXT_REDUCER_BASE_DRIFT !== "1") return "${"c".repeat(40)}";
  const path = process.env.PLUS_ULTRA_CONTEXT_REDUCER_GH_CALLS;
  const calls = path && existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;
  if (path) writeFileSync(path, String(calls + 1));
  return calls === 0 ? "${"c".repeat(40)}" : "${"d".repeat(40)}";
};
if (args[0] === "pr" && args[1] === "view") {
  json({ number: 17, url: "https://example.invalid/example/reading-list/pull/17", state: "OPEN", baseRefName: "main", baseRefOid: nextPrBase(), headRefName: "feature/issue-101-tags", headRefOid: nextPrHead(), headRepository: { nameWithOwner: "example/reading-list" }, closingIssuesReferences: [{ number: 101, url: "https://example.invalid/issues/101" }] });
} else if (args[0] === "api" && args[1].startsWith("repos/example/reading-list/compare/")) {
  const files = Array.from({ length: truncatedComparison ? 300 : 1 }, (_, index) => ({ filename: "src/library-" + index + ".mjs", status: "modified", additions: 2, deletions: 1, changes: 3, patch: "large raw patch" }));
  json({ base_commit: { sha: "${"c".repeat(40)}" }, files });
} else if (args[0] === "api" && args[1] === "repos/example/reading-list/contents/specs?ref=" + head) {
  json([{ type: "file", path: "specs/001-tags.md", sha: "${"1".repeat(40)}" }]);
} else if (args[0] === "api" && args[1] === "repos/example/reading-list/contents/specs/001-tags.md?ref=" + head) {
  json({ type: "file", encoding: "base64", content: Buffer.from("---\\nstatus: approved\\nissue: 101\\n---\\n# Tags\\n").toString("base64") });
} else if (args[0] === "api" && args[1] === "user") {
  json({ login: "reviewer", id: "USER_1" });
} else if (args[0] === "api" && args[1] === "graphql") {
  const comment = { id: "COMMENT_1", databaseId: 101, url: "https://example.invalid/comments/101", author: { login: "reviewer" }, body: "<!-- plus-ultra:pr-review:inline -->\\nLong finding", path: "src/library.mjs", line: 5, originalLine: 5, diffSide: "RIGHT", updatedAt: "2026-09-16T00:00:00Z" };
  const thread = { id: "THREAD_1", isResolved: false, comments: { nodes: [comment], pageInfo: { hasNextPage: process.env.PLUS_ULTRA_CONTEXT_REDUCER_INCOMPLETE_COMMENTS === "1", endCursor: null } } };
  json({ data: { repository: { pullRequest: { reviewThreads: { nodes: [thread], pageInfo: { hasNextPage: repeatedThreadCursor, endCursor: repeatedThreadCursor ? "REPEATED" : null } } } } } });
} else if (args[0] === "api" && args[1] === "--paginate" && args[3] === "repos/example/reading-list/pulls/17/files?per_page=100") {
  json([Array.from({ length: truncatedComparison ? 301 : 1 }, (_, index) => ({ filename: "src/library-" + index + ".mjs", status: "modified", additions: 2, deletions: 1, changes: 3, patch: "large raw patch" }))]);
} else if (args[0] === "api" && args[1] === "--paginate") {
  json([[{ id: 201, html_url: "https://example.invalid/comments/201", user: { login: "reviewer" }, body: "<!-- plus-ultra:pr-review:summary -->\\nLong summary", updated_at: "2026-09-16T00:00:00Z" }]]);
} else if (args[0] === "api" && args[1] === "repos/example/reading-list/pulls/comments/101") {
  json({ id: 101, url: "https://example.invalid/comments/101", author: { login: "reviewer" }, body: "<!-- plus-ultra:pr-review:inline -->\\nLong finding", updated_at: "2026-09-16T00:00:00Z" });
} else {
  process.stderr.write("unexpected gh call: " + args.join(" "));
  process.exit(64);
}
`;
  const executable = join(directory, "gh");
  writeFileSync(executable, source);
  chmodSync(executable, 0o755);
  return directory;
}

test("indexSpecs returns only compact approved-spec metadata with immutable provenance", () => {
  const result = indexSpecs({
    repository,
    ref: headOid,
    files: [
      {
        path: "specs/002-draft.md",
        sha: "2".repeat(40),
        content: "---\nstatus: draft\nissue: 102\n---\n# Draft\n",
      },
      {
        path: "specs/001-tags.md",
        sha: "1".repeat(40),
        content: "---\nstatus: approved\nissue: 101\n---\n# Tags\n",
      },
      {
        path: "specs/003-legacy.md",
        sha: "3".repeat(40),
        content: "---\nstatus: approved\n---\n# Legacy\n",
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      source: { repository, ref: headOid },
      specs: [
        { path: "specs/001-tags.md", status: "approved", issue: 101, sha: "1".repeat(40) },
        { path: "specs/002-draft.md", status: "draft", issue: 102, sha: "2".repeat(40) },
        { path: "specs/003-legacy.md", status: "approved", issue: null, sha: "3".repeat(40) },
      ],
    },
  });
});

test("CLI main is importable and rejects invalid commands without process side effects", () => {
  assert.deepEqual(reducerMain(["unknown"]), {
    ok: false,
    error: { code: "invalid_arguments", message: "Use pr-review-context or comment-evidence" },
  });
});

test("indexSpecs fails explicitly for malformed frontmatter rather than indexing a spec", () => {
  const result = indexSpecs({
    repository,
    ref: headOid,
    files: [
      {
        path: "specs/001-invalid.md",
        sha: "1".repeat(40),
        content: "# Missing frontmatter\n",
      },
    ],
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "malformed_spec",
      message: "specs/001-invalid.md must begin with YAML frontmatter containing status",
    },
  });
});

test("indexSpecs accepts YAML comments after supported structural values", () => {
  const result = indexSpecs({
    repository,
    ref: headOid,
    files: [
      {
        path: "specs/001-commented.md",
        sha: "1".repeat(40),
        content: "---\nstatus: approved # ready for review\nissue: 101 # parent story\n---\n# Commented\n",
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      source: { repository, ref: headOid },
      specs: [
        { path: "specs/001-commented.md", status: "approved", issue: 101, sha: "1".repeat(40) },
      ],
    },
  });
});

test("resolveContract preserves canonical closing-Issue selection with the remote spec SHA", () => {
  const result = resolveContract({
    index: {
      source: { repository, ref: headOid },
      specs: [
        { path: "specs/001-tags.md", status: "approved", issue: 101, sha: "1".repeat(40) },
        { path: "specs/002-legacy.md", status: "approved", issue: null, sha: "2".repeat(40) },
      ],
    },
    closingIssues: [101],
    headRefName: "feature/issue-101-tags",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      source: { repository, ref: headOid },
      resolution: "closing_issue",
      contract: { path: "specs/001-tags.md", issue: 101, sha: "1".repeat(40) },
    },
  });
});

test("resolveContract fails with stable candidates when branch association is ambiguous", () => {
  const result = resolveContract({
    index: {
      source: { repository, ref: headOid },
      specs: [
        { path: "specs/002-alpha.md", status: "approved", issue: 102, sha: "2".repeat(40) },
        { path: "specs/001-beta.md", status: "approved", issue: 101, sha: "1".repeat(40) },
      ],
    },
    closingIssues: [],
    headRefName: "feature/issue-101-issue-102",
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "ambiguous_contract",
      message: "Multiple approved specs match branch association",
      candidates: [
        { path: "specs/001-beta.md", issue: 101, sha: "1".repeat(40) },
        { path: "specs/002-alpha.md", issue: 102, sha: "2".repeat(40) },
      ],
    },
  });
});

test("compactPrSnapshot drops patches while retaining immutable PR provenance", () => {
  const result = compactPrSnapshot({
    repository,
    expectedHeadOid: headOid,
    pr: {
      number: 17,
      url: "https://example.invalid/example/reading-list/pull/17",
      state: "OPEN",
      baseRefName: "main",
      baseRefOid: "c".repeat(40),
      headRefName: "feature/issue-101-tags",
      headRefOid: headOid,
      headRepository: { nameWithOwner: "example/reading-list" },
      closingIssuesReferences: [{ number: 101, url: "https://example.invalid/issues/101" }],
    },
    comparison: {
      base_commit: { sha: "c".repeat(40) },
      files: [
        {
          filename: "src/library.mjs",
          status: "modified",
          additions: 2,
          deletions: 1,
          changes: 3,
          patch: "this must not reach the compact result",
        },
      ],
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      source: { repository, pull_number: 17, base_oid: "c".repeat(40), head_oid: headOid },
      pr: {
        number: 17,
        url: "https://example.invalid/example/reading-list/pull/17",
        state: "OPEN",
        base: { ref: "main", oid: "c".repeat(40) },
        head: { ref: "feature/issue-101-tags", oid: headOid, repository: "example/reading-list" },
        closing_issues: [{ number: 101, url: "https://example.invalid/issues/101" }],
        changed_files: [
          { path: "src/library.mjs", status: "modified", additions: 2, deletions: 1, changes: 3 },
        ],
      },
    },
  });
});

test("compactPrSnapshot rejects an unexpected current head as stale", () => {
  const result = compactPrSnapshot({
    repository,
    expectedHeadOid: "b".repeat(40),
    pr: {
      number: 17,
      url: "https://example.invalid/pull/17",
      state: "OPEN",
      baseRefName: "main",
      baseRefOid: "c".repeat(40),
      headRefName: "feature/issue-101-tags",
      headRefOid: headOid,
      headRepository: { nameWithOwner: repository },
      closingIssuesReferences: [],
    },
    comparison: { base_commit: { sha: "c".repeat(40) }, files: [] },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "stale_snapshot",
      message: "Expected PR head bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb but found aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
});

test("compactReviewState retains only tagged metadata and omits comment bodies", () => {
  const result = compactReviewState({
    repository,
    pullNumber: 17,
    headOid,
    reviewer: { login: "reviewer", id: "USER_1" },
    threads: [
      {
        id: "THREAD_1",
        isResolved: false,
        comments: {
          nodes: [
            {
              id: "COMMENT_1",
              databaseId: 101,
              url: "https://example.invalid/comments/101",
              author: { login: "reviewer" },
              body: "<!-- plus-ultra:pr-review:inline -->\nLong finding body",
              path: "src/library.mjs",
              line: 5,
              originalLine: 5,
              diffSide: "RIGHT",
              updatedAt: "2026-09-16T00:00:00Z",
            },
          ],
        },
      },
      {
        id: "THREAD_2",
        isResolved: false,
        comments: { nodes: [{ id: "COMMENT_2", body: "unrelated" }] },
      },
    ],
    summaries: [
      {
        id: 201,
        html_url: "https://example.invalid/comments/201",
        user: { login: "reviewer" },
        body: "<!-- plus-ultra:pr-review:summary -->\nLong summary body",
        updated_at: "2026-09-16T00:00:00Z",
      },
      { id: 202, body: "unrelated" },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      source: { repository, pull_number: 17, head_oid: headOid },
      reviewer: { login: "reviewer", id: "USER_1" },
      threads: [
        {
          id: "THREAD_1",
          resolved: false,
          comments: [
            {
              id: "COMMENT_1",
              database_id: 101,
              url: "https://example.invalid/comments/101",
              author: "reviewer",
              authored_by_reviewer: true,
              marker: "inline",
              path: "src/library.mjs",
              line: 5,
              original_line: 5,
              side: "RIGHT",
              updated_at: "2026-09-16T00:00:00Z",
            },
          ],
        },
      ],
      summaries: [
        {
          id: 201,
          url: "https://example.invalid/comments/201",
          author: "reviewer",
          authored_by_reviewer: true,
          marker: "summary",
          updated_at: "2026-09-16T00:00:00Z",
        },
      ],
    },
  });
});

test("pr-review-context fetches remote data and emits a compact provenance-preserving envelope", () => {
  const directory = fakeGhDirectory();
  try {
    const result = spawnSync(
      process.execPath,
      [reducerCli, "pr-review-context", "--repo", repository, "--pr", "17"],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      }
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.value.source.head_oid, headOid);
    assert.deepEqual(payload.value.specs, [
      { path: "specs/001-tags.md", status: "approved", issue: 101, sha: "1".repeat(40) },
    ]);
    assert.equal(payload.value.contract.resolution, "closing_issue");
    assert.equal(payload.value.review_state.threads[0].comments[0].body, undefined);
    assert.equal(JSON.stringify(payload).includes("large raw patch"), false);
    assert.equal(JSON.stringify(payload).includes("Long finding"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("pr-review-context obtains all changed files from the paginated PR endpoint", () => {
  const directory = fakeGhDirectory();
  try {
    const result = spawnSync(
      process.execPath,
      [reducerCli, "pr-review-context", "--repo", repository, "--pr", "17"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          PLUS_ULTRA_CONTEXT_REDUCER_TRUNCATED_COMPARE: "1",
        },
      }
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.value.pr.changed_files.length, 301);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("pr-review-context rejects a head change after changed-file pagination", () => {
  const directory = fakeGhDirectory();
  const calls = join(directory, "pr-calls");
  try {
    const result = spawnSync(
      process.execPath,
      [reducerCli, "pr-review-context", "--repo", repository, "--pr", "17"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          PLUS_ULTRA_CONTEXT_REDUCER_HEAD_DRIFT: "1",
          PLUS_ULTRA_CONTEXT_REDUCER_GH_CALLS: calls,
        },
      }
    );
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      error: {
        code: "stale_snapshot",
        message: "PR base or head changed while gathering changed-file metadata",
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("pr-review-context rejects a base change after changed-file pagination", () => {
  const directory = fakeGhDirectory();
  const calls = join(directory, "pr-calls");
  try {
    const result = spawnSync(
      process.execPath,
      [reducerCli, "pr-review-context", "--repo", repository, "--pr", "17"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          PLUS_ULTRA_CONTEXT_REDUCER_BASE_DRIFT: "1",
          PLUS_ULTRA_CONTEXT_REDUCER_GH_CALLS: calls,
        },
      }
    );
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      error: {
        code: "stale_snapshot",
        message: "PR base or head changed while gathering changed-file metadata",
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("comment-evidence expands only the requested tagged comment", () => {
  const directory = fakeGhDirectory();
  try {
    const result = spawnSync(
      process.execPath,
      [
        reducerCli,
        "comment-evidence",
        "--repo",
        repository,
        "--pr",
        "17",
        "--kind",
        "inline",
        "--id",
        "101",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      }
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: true,
      value: {
        source: { repository, pull_number: 17 },
        evidence: {
          id: 101,
          kind: "inline",
          marker: "inline",
          author: "reviewer",
          url: "https://example.invalid/comments/101",
          updated_at: "2026-09-16T00:00:00Z",
          body: "<!-- plus-ultra:pr-review:inline -->\nLong finding",
        },
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reducers cut each representative structural payload by at least half", () => {
  const largeSpecs = Array.from({ length: 40 }, (_, index) => ({
    path: `specs/${String(index + 1).padStart(3, "0")}-feature-${index}.md`,
    sha: String((index % 9) + 1).repeat(40),
    content: `---\nstatus: approved\nissue: ${index + 1}\n---\n${"long contract text ".repeat(500)}`,
  }));
  const indexed = indexSpecs({ repository, ref: headOid, files: largeSpecs });
  assert.equal(indexed.ok, true);
  assert.ok(JSON.stringify(indexed.value).length * 2 <= JSON.stringify(largeSpecs).length);

  const rawComparison = {
    base_commit: { sha: "c".repeat(40) },
    files: Array.from({ length: 25 }, (_, index) => ({
      filename: `src/file-${index}.mjs`,
      status: "modified",
      additions: 2,
      deletions: 1,
      changes: 3,
      patch: "unchanged low-value patch payload ".repeat(500),
    })),
  };
  const snapshot = compactPrSnapshot({
    repository,
    pr: {
      number: 17,
      url: "https://example.invalid/pull/17",
      state: "OPEN",
      baseRefName: "main",
      baseRefOid: "c".repeat(40),
      headRefName: "feature/issue-101",
      headRefOid: headOid,
      headRepository: { nameWithOwner: repository },
      closingIssuesReferences: [{ number: 101, url: "https://example.invalid/issues/101" }],
    },
    comparison: rawComparison,
  });
  assert.equal(snapshot.ok, true);
  assert.ok(JSON.stringify(snapshot.value).length * 2 <= JSON.stringify(rawComparison).length);

  const rawReviewState = {
    threads: Array.from({ length: 40 }, (_, index) => ({
      id: `THREAD_${index}`,
      isResolved: false,
      comments: {
        nodes: [
          {
            id: `COMMENT_${index}`,
            databaseId: index + 1,
            url: `https://example.invalid/comments/${index + 1}`,
            author: { login: "reviewer" },
            body: `${index === 0 ? "<!-- plus-ultra:pr-review:inline -->" : "unrelated"}\n${"long comment payload ".repeat(500)}`,
            path: "src/library.mjs",
            line: 5,
            originalLine: 5,
            diffSide: "RIGHT",
            updatedAt: "2026-09-16T00:00:00Z",
          },
        ],
      },
    })),
    summaries: [],
  };
  const reviewState = compactReviewState({
    repository,
    pullNumber: 17,
    headOid,
    reviewer: { login: "reviewer", id: "USER_1" },
    ...rawReviewState,
  });
  assert.equal(reviewState.ok, true);
  assert.ok(JSON.stringify(reviewState.value).length * 2 <= JSON.stringify(rawReviewState).length);
});

test("pr-review-context reports stale expected heads as structured failures", () => {
  const directory = fakeGhDirectory();
  try {
    const result = spawnSync(
      process.execPath,
      [
        reducerCli,
        "pr-review-context",
        "--repo",
        repository,
        "--pr",
        "17",
        "--expect-head",
        "b".repeat(40),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      }
    );
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      error: {
        code: "stale_snapshot",
        message: "Expected PR head bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb but found aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("pr-review-context rejects incomplete tagged-comment pagination", () => {
  const directory = fakeGhDirectory();
  try {
    const result = spawnSync(
      process.execPath,
      [reducerCli, "pr-review-context", "--repo", repository, "--pr", "17"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          PLUS_ULTRA_CONTEXT_REDUCER_INCOMPLETE_COMMENTS: "1",
        },
      }
    );
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      error: {
        code: "malformed_github_response",
        message: "GitHub review-thread comment pagination is incomplete",
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("pr-review-context rejects a repeated review-thread cursor", () => {
  const directory = fakeGhDirectory();
  try {
    const result = spawnSync(
      process.execPath,
      [reducerCli, "pr-review-context", "--repo", repository, "--pr", "17"],
      {
        encoding: "utf8",
        timeout: 1000,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          PLUS_ULTRA_CONTEXT_REDUCER_REPEATED_THREAD_CURSOR: "1",
        },
      }
    );
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      error: {
        code: "malformed_github_response",
        message: "GitHub review-thread pagination repeated a cursor",
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
