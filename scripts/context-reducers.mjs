#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchCommentEvidence,
  fetchComparison,
  fetchPullFiles,
  fetchPullRequest,
  fetchRemoteSpecs,
  fetchReviewer,
  fetchReviewThreads,
  fetchSummaryComments,
} from "./context-reducers/github.mjs";
import {
  assessIncrementalReview,
  compactPrSnapshot,
  compactReviewState,
  indexSpecs,
  parseReviewSnapshot,
  resolveContract,
} from "./context-reducers/core.mjs";

const validRepository = (value) => typeof value === "string" && /^[^/\s]+\/[^/\s]+$/.test(value);
const validSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
const validPositiveInteger = (value) => /^\d+$/.test(value) && Number(value) > 0;
const failure = (code, message) => ({ ok: false, error: { code, message } });
const fullIncremental = (reason) => ({
  ok: true,
  value: { disposition: "full", reason, prior: null, delta: null },
});

function snapshotMarkerFromSummary(summary) {
  if (typeof summary?.body !== "string") return null;
  const markers = summary.body.match(/<!-- plus-ultra:pr-review:snapshot:v1 [A-Za-z0-9_-]+ -->/g) ?? [];
  return markers.length === 1 ? markers[0] : markers.length === 0 ? null : false;
}

function incrementalReview(input) {
  const candidates = input.summaries
    .filter(
      (summary) =>
        typeof summary?.body === "string" &&
        summary.body.startsWith("<!-- plus-ultra:pr-review:summary -->") &&
        summary.user?.login === input.reviewer.login
    )
    .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)) || right.id - left.id);
  const summary = candidates[0];
  if (!summary) return fullIncremental("no_snapshot");
  const marker = snapshotMarkerFromSummary(summary);
  if (marker === null) return fullIncremental("no_snapshot");
  if (marker === false) return fullIncremental("invalid_snapshot");
  const parsed = parseReviewSnapshot(marker);
  if (!parsed.ok) return fullIncremental("invalid_snapshot");
  if (!input.contract) return fullIncremental("no_contract");
  const comparison =
    parsed.value.source.head_oid === input.snapshot.source.head_oid
      ? { status: "identical", files: [] }
      : fetchComparison(input.repository, parsed.value.source.head_oid, input.snapshot.source.head_oid);
  if (!comparison.ok && comparison.ok !== undefined) return comparison;
  return assessIncrementalReview({
    repository: input.repository,
    pullNumber: input.pullNumber,
    current: {
      head_oid: input.snapshot.source.head_oid,
      base: input.snapshot.pr.base,
      contract: input.contract,
    },
    prior: parsed.value,
    comparison: comparison.value ?? comparison,
  });
}

function parseOptions(args, allowed) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag.startsWith("--") || !allowed.includes(flag) || index + 1 >= args.length) {
      return failure("invalid_arguments", "Invalid context-reducer arguments");
    }
    const value = args[index + 1];
    if (value.startsWith("--") || Object.hasOwn(options, flag)) {
      return failure("invalid_arguments", "Invalid context-reducer arguments");
    }
    options[flag] = value;
    index += 1;
  }
  return { ok: true, value: options };
}

function inputFor(command, args) {
  if (command === "pr-review-context") {
    const parsed = parseOptions(args, ["--repo", "--pr", "--spec", "--expect-head"]);
    if (!parsed.ok) return parsed;
    const options = parsed.value;
    if (!validRepository(options["--repo"]) || !validPositiveInteger(options["--pr"])) {
      return failure("invalid_arguments", "pr-review-context requires --repo <owner/repo> and --pr <positive-integer>");
    }
    if (options["--expect-head"] !== undefined && !validSha(options["--expect-head"])) {
      return failure("invalid_arguments", "--expect-head must be an immutable SHA");
    }
    return { ok: true, value: { command, repository: options["--repo"], pullNumber: Number(options["--pr"]), selector: options["--spec"], expectedHeadOid: options["--expect-head"] } };
  }
  if (command === "comment-evidence") {
    const parsed = parseOptions(args, ["--repo", "--pr", "--kind", "--id"]);
    if (!parsed.ok) return parsed;
    const options = parsed.value;
    if (
      !validRepository(options["--repo"]) ||
      !validPositiveInteger(options["--pr"]) ||
      !["inline", "summary"].includes(options["--kind"]) ||
      !validPositiveInteger(options["--id"])
    ) {
      return failure("invalid_arguments", "comment-evidence requires --repo, --pr, --kind, and --id");
    }
    return { ok: true, value: { command, repository: options["--repo"], pullNumber: Number(options["--pr"]), kind: options["--kind"], id: Number(options["--id"]) } };
  }
  return failure("invalid_arguments", "Use pr-review-context or comment-evidence");
}

function reviewContext(input) {
  const pr = fetchPullRequest(input.repository, input.pullNumber);
  if (!pr.ok) return pr;
  const comparison = fetchComparison(input.repository, pr.value.baseRefOid, pr.value.headRefOid);
  if (!comparison.ok) return comparison;
  const changedFiles = fetchPullFiles(input.repository, input.pullNumber);
  if (!changedFiles.ok) return changedFiles;
  const currentPr = fetchPullRequest(input.repository, input.pullNumber);
  if (!currentPr.ok) return currentPr;
  if (
    currentPr.value.headRefOid !== pr.value.headRefOid ||
    currentPr.value.baseRefOid !== pr.value.baseRefOid
  ) {
    return failure(
      "stale_snapshot",
      "PR base or head changed while gathering changed-file metadata"
    );
  }
  const snapshot = compactPrSnapshot({
    repository: input.repository,
    expectedHeadOid: input.expectedHeadOid,
    pr: pr.value,
    comparison: { ...comparison.value, files: changedFiles.value },
  });
  if (!snapshot.ok) return snapshot;
  const headRepository = pr.value.headRepository?.nameWithOwner;
  const files = fetchRemoteSpecs(headRepository, pr.value.headRefOid);
  if (!files.ok) return files;
  const index = indexSpecs({ repository: headRepository, ref: pr.value.headRefOid, files: files.value });
  if (!index.ok) return index;
  const contract = resolveContract({
    index: index.value,
    closingIssues: snapshot.value.pr.closing_issues.map(({ number }) => number),
    headRefName: snapshot.value.pr.head.ref,
    selector: input.selector,
  });
  if (!contract.ok) return contract;
  const reviewer = fetchReviewer();
  if (!reviewer.ok) return reviewer;
  const threads = fetchReviewThreads(input.repository, input.pullNumber);
  if (!threads.ok) return threads;
  const summaries = fetchSummaryComments(input.repository, input.pullNumber);
  if (!summaries.ok) return summaries;
  const incremental = incrementalReview({
    repository: input.repository,
    pullNumber: input.pullNumber,
    snapshot: snapshot.value,
    contract: contract.value.contract,
    reviewer: reviewer.value,
    summaries: summaries.value,
  });
  if (!incremental.ok) return incremental;
  const reviewState = compactReviewState({
    repository: input.repository,
    pullNumber: input.pullNumber,
    headOid: snapshot.value.source.head_oid,
    reviewer: reviewer.value,
    threads: threads.value,
    summaries: summaries.value,
  });
  if (!reviewState.ok) return reviewState;
  return {
    ok: true,
    value: {
      source: snapshot.value.source,
      pr: snapshot.value.pr,
      specs: index.value.specs,
      contract: contract.value,
      incremental: incremental.value,
      review_state: {
        reviewer: reviewState.value.reviewer,
        threads: reviewState.value.threads,
        summaries: reviewState.value.summaries,
      },
    },
  };
}

function commentEvidence(input) {
  const result = fetchCommentEvidence(input.repository, input.pullNumber, input.kind, input.id);
  if (!result.ok) return result;
  const body = result.value?.body;
  const marker =
    typeof body === "string" && body.startsWith("<!-- plus-ultra:pr-review:inline -->")
      ? "inline"
      : typeof body === "string" && body.startsWith("<!-- plus-ultra:pr-review:summary -->")
        ? "summary"
        : null;
  if (marker !== input.kind) {
    return failure("unmatched_evidence", "Requested comment does not contain the expected Plus Ultra marker");
  }
  const author = result.value.author?.login ?? result.value.user?.login;
  const url = result.value.url ?? result.value.html_url;
  const updatedAt = result.value.updated_at ?? result.value.updatedAt;
  if (typeof author !== "string" || typeof url !== "string" || typeof updatedAt !== "string") {
    return failure("malformed_github_response", "Tagged comment evidence is missing provenance");
  }
  return {
    ok: true,
    value: {
      source: { repository: input.repository, pull_number: input.pullNumber },
      evidence: { id: input.id, kind: input.kind, marker, author, url, updated_at: updatedAt, body },
    },
  };
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const input = inputFor(command, args);
  if (!input.ok) return input;
  return input.value.command === "pr-review-context" ? reviewContext(input.value) : commentEvidence(input.value);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const result = main();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
