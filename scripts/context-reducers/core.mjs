const STATUSES = new Set(["draft", "approved", "superseded"]);

const ok = (value) => Object.freeze({ ok: true, value: deepFreeze(value) });
const failure = (code, message, details = {}) =>
  Object.freeze({ ok: false, error: Object.freeze({ code, message, ...details }) });

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function validRepository(value) {
  return typeof value === "string" && /^[^/\s]+\/[^/\s]+$/.test(value);
}

function validSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function validUrl(value) {
  return typeof value === "string" && /^https?:\/\/\S+$/.test(value);
}

function validPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function frontmatter(path, content) {
  if (typeof content !== "string") {
    return failure("malformed_spec", `${path} must contain Markdown text`);
  }
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return failure("malformed_spec", `${path} must begin with YAML frontmatter containing status`);
  }
  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const rawValue = line.slice(separator + 1).trim();
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue.replace(/\s+#.*$/, "");
    fields.set(line.slice(0, separator).trim(), value);
  }
  const status = fields.get("status");
  if (!STATUSES.has(status)) {
    return failure("malformed_spec", `${path} must begin with YAML frontmatter containing status`);
  }
  const issueValue = fields.get("issue");
  if (issueValue === undefined) return ok({ status, issue: null });
  if (!/^\d+$/.test(issueValue) || Number(issueValue) < 1) {
    return failure("malformed_spec", `${path} has an invalid issue frontmatter value`);
  }
  return ok({ status, issue: Number(issueValue) });
}

export function indexSpecs(input) {
  if (!input || !validRepository(input.repository) || !validSha(input.ref) || !Array.isArray(input.files)) {
    return failure("invalid_spec_index", "repository, immutable ref, and files are required");
  }
  const specs = [];
  const paths = new Set();
  for (const file of input.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      !/^specs\/\d{3}-.+\.md$/.test(file.path) ||
      !validSha(file.sha)
    ) {
      return failure("malformed_spec", "Each spec must have a canonical path and immutable SHA");
    }
    if (paths.has(file.path)) return failure("malformed_spec", `Duplicate spec path: ${file.path}`);
    paths.add(file.path);
    const parsed = frontmatter(file.path, file.content);
    if (!parsed.ok) return parsed;
    specs.push({ path: file.path, status: parsed.value.status, issue: parsed.value.issue, sha: file.sha });
  }
  specs.sort((left, right) => left.path.localeCompare(right.path));
  return ok({ source: { repository: input.repository, ref: input.ref }, specs });
}

function validIndexedSpec(spec) {
  return (
    spec &&
    typeof spec.path === "string" &&
    /^specs\/\d{3}-.+\.md$/.test(spec.path) &&
    STATUSES.has(spec.status) &&
    (spec.issue === null || (Number.isInteger(spec.issue) && spec.issue > 0)) &&
    validSha(spec.sha)
  );
}

function validIndex(index) {
  return (
    index &&
    validRepository(index.source?.repository) &&
    validSha(index.source?.ref) &&
    Array.isArray(index.specs) &&
    index.specs.every(validIndexedSpec) &&
    new Set(index.specs.map(({ path }) => path)).size === index.specs.length
  );
}

function contractOf(spec) {
  return { path: spec.path, issue: spec.issue, sha: spec.sha };
}

function orderedContracts(specs) {
  return specs.map(contractOf).sort((left, right) => left.path.localeCompare(right.path));
}

function stemOf(path) {
  return path.slice("specs/".length, -".md".length);
}

function selectorCandidates(specs, selector) {
  if (/^\d+$/.test(selector)) {
    const prefix = `${selector.padStart(3, "0")}-`;
    return specs.filter((spec) => stemOf(spec.path).startsWith(prefix));
  }
  return specs.filter((spec) => {
    const stem = stemOf(spec.path);
    return stem === selector || stem.slice(4) === selector;
  });
}

function branchCandidates(specs, headRefName) {
  const components = headRefName.split("/");
  return specs.filter((spec) => {
    const direct =
      spec.issue !== null &&
      components.some((component) => new RegExp(`(?:^|-)issue-${spec.issue}(?:-|$)`).test(component));
    const indirect = components.includes(stemOf(spec.path));
    return direct || indirect;
  });
}

export function resolveContract(input) {
  if (
    !input ||
    !validIndex(input.index) ||
    !Array.isArray(input.closingIssues) ||
    input.closingIssues.some((issue) => !Number.isInteger(issue) || issue < 1) ||
    typeof input.headRefName !== "string" ||
    input.headRefName.length === 0 ||
    (input.selector !== undefined && (typeof input.selector !== "string" || input.selector.length === 0))
  ) {
    return failure("invalid_contract_input", "A valid spec index, closing Issues, and head branch are required");
  }
  const approved = input.index.specs.filter(({ status }) => status === "approved");
  const closing = new Set(input.closingIssues);
  const canonical = approved.filter((spec) => spec.issue !== null && closing.has(spec.issue));
  if (canonical.length === 1) {
    return ok({
      source: input.index.source,
      resolution: "closing_issue",
      contract: contractOf(canonical[0]),
    });
  }
  if (input.selector !== undefined) {
    const candidates = selectorCandidates(input.index.specs, input.selector);
    if (candidates.length !== 1 || candidates[0].status !== "approved") {
      return failure("invalid_selector", "Selector must resolve to exactly one approved spec", {
        candidates: orderedContracts(candidates),
      });
    }
    return ok({ source: input.index.source, resolution: "selector", contract: contractOf(candidates[0]) });
  }
  const branch = branchCandidates(approved, input.headRefName);
  if (branch.length === 1) {
    return ok({ source: input.index.source, resolution: "branch", contract: contractOf(branch[0]) });
  }
  if (branch.length > 1) {
    return failure("ambiguous_contract", "Multiple approved specs match branch association", {
      candidates: orderedContracts(branch),
    });
  }
  if (approved.length === 1) {
    return ok({ source: input.index.source, resolution: "discovery", contract: contractOf(approved[0]) });
  }
  if (approved.length > 1) {
    return failure("ambiguous_contract", "Multiple approved specs require explicit selection", {
      candidates: orderedContracts(approved),
    });
  }
  return ok({ source: input.index.source, resolution: "none", contract: null });
}

function compactChangedFile(file) {
  if (
    !file ||
    typeof file.filename !== "string" ||
    typeof file.status !== "string" ||
    !Number.isInteger(file.additions) ||
    !Number.isInteger(file.deletions) ||
    !Number.isInteger(file.changes) ||
    file.additions < 0 ||
    file.deletions < 0 ||
    file.changes < 0
  ) {
    return failure("malformed_pr", "Each changed file must have path, status, and non-negative statistics");
  }
  return ok({
    path: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
  });
}

export function compactPrSnapshot(input) {
  const pr = input?.pr;
  const comparison = input?.comparison;
  if (
    !validRepository(input?.repository) ||
    !pr ||
    !validPositiveInteger(pr.number) ||
    !validUrl(pr.url) ||
    typeof pr.state !== "string" ||
    typeof pr.baseRefName !== "string" ||
    !validSha(pr.baseRefOid) ||
    typeof pr.headRefName !== "string" ||
    !validSha(pr.headRefOid) ||
    !validRepository(pr.headRepository?.nameWithOwner) ||
    !Array.isArray(pr.closingIssuesReferences) ||
    !comparison ||
    !validSha(comparison.base_commit?.sha) ||
    !Array.isArray(comparison.files)
  ) {
    return failure("malformed_pr", "PR metadata and comparison payload are incomplete");
  }
  if (input.expectedHeadOid !== undefined && !validSha(input.expectedHeadOid)) {
    return failure("invalid_expected_head", "expectedHeadOid must be an immutable SHA");
  }
  if (input.expectedHeadOid !== undefined && input.expectedHeadOid !== pr.headRefOid) {
    return failure(
      "stale_snapshot",
      `Expected PR head ${input.expectedHeadOid} but found ${pr.headRefOid}`
    );
  }
  if (comparison.base_commit.sha !== pr.baseRefOid) {
    return failure("stale_snapshot", "Comparison base SHA does not match PR metadata");
  }
  const closingIssues = [];
  for (const issue of pr.closingIssuesReferences) {
    if (!validPositiveInteger(issue?.number) || !validUrl(issue.url)) {
      return failure("malformed_pr", "Each closing Issue must have a positive number and URL");
    }
    closingIssues.push({ number: issue.number, url: issue.url });
  }
  if (new Set(closingIssues.map(({ number }) => number)).size !== closingIssues.length) {
    return failure("malformed_pr", "Closing Issues must not be duplicated");
  }
  const changedFiles = [];
  for (const file of comparison.files) {
    const compact = compactChangedFile(file);
    if (!compact.ok) return compact;
    changedFiles.push(compact.value);
  }
  if (new Set(changedFiles.map(({ path }) => path)).size !== changedFiles.length) {
    return failure("malformed_pr", "Changed file paths must not be duplicated");
  }
  closingIssues.sort((left, right) => left.number - right.number);
  changedFiles.sort((left, right) => left.path.localeCompare(right.path));
  return ok({
    source: {
      repository: input.repository,
      pull_number: pr.number,
      base_oid: pr.baseRefOid,
      head_oid: pr.headRefOid,
    },
    pr: {
      number: pr.number,
      url: pr.url,
      state: pr.state,
      base: { ref: pr.baseRefName, oid: pr.baseRefOid },
      head: { ref: pr.headRefName, oid: pr.headRefOid, repository: pr.headRepository.nameWithOwner },
      closing_issues: closingIssues,
      changed_files: changedFiles,
    },
  });
}

const inlineMarker = "<!-- plus-ultra:pr-review:inline -->";
const summaryMarker = "<!-- plus-ultra:pr-review:summary -->";

function markerOf(body) {
  if (typeof body !== "string") return null;
  if (body.startsWith(inlineMarker)) return "inline";
  if (body.startsWith(summaryMarker)) return "summary";
  return null;
}

function validId(value) {
  return (typeof value === "string" && value.length > 0) || validPositiveInteger(value);
}

function compactTaggedComment(comment, reviewer) {
  const marker = markerOf(comment?.body);
  if (marker !== "inline") return ok(null);
  if (
    !validId(comment.id) ||
    !validPositiveInteger(comment.databaseId) ||
    !validUrl(comment.url) ||
    typeof comment.author?.login !== "string" ||
    typeof comment.path !== "string" ||
    !Number.isInteger(comment.line) ||
    !Number.isInteger(comment.originalLine) ||
    typeof comment.diffSide !== "string" ||
    typeof comment.updatedAt !== "string"
  ) {
    return failure("malformed_review_state", "Tagged review comments must retain complete provenance");
  }
  return ok({
    id: comment.id,
    database_id: comment.databaseId,
    url: comment.url,
    author: comment.author.login,
    authored_by_reviewer: comment.author.login === reviewer.login,
    marker,
    path: comment.path,
    line: comment.line,
    original_line: comment.originalLine,
    side: comment.diffSide,
    updated_at: comment.updatedAt,
  });
}

function compactTaggedSummary(summary, reviewer) {
  const marker = markerOf(summary?.body);
  if (marker !== "summary") return ok(null);
  if (
    !validPositiveInteger(summary.id) ||
    !validUrl(summary.html_url) ||
    typeof summary.user?.login !== "string" ||
    typeof summary.updated_at !== "string"
  ) {
    return failure("malformed_review_state", "Tagged review summaries must retain complete provenance");
  }
  return ok({
    id: summary.id,
    url: summary.html_url,
    author: summary.user.login,
    authored_by_reviewer: summary.user.login === reviewer.login,
    marker,
    updated_at: summary.updated_at,
  });
}

export function compactReviewState(input) {
  if (
    !validRepository(input?.repository) ||
    !validPositiveInteger(input.pullNumber) ||
    !validSha(input.headOid) ||
    typeof input.reviewer?.login !== "string" ||
    !validId(input.reviewer.id) ||
    !Array.isArray(input.threads) ||
    !Array.isArray(input.summaries)
  ) {
    return failure("malformed_review_state", "Review state requires immutable PR provenance and reviewer identity");
  }
  const threads = [];
  for (const thread of input.threads) {
    if (!validId(thread?.id) || typeof thread.isResolved !== "boolean" || !Array.isArray(thread.comments?.nodes)) {
      return failure("malformed_review_state", "Each review thread must have identity, state, and comments");
    }
    const comments = [];
    for (const comment of thread.comments.nodes) {
      const compact = compactTaggedComment(comment, input.reviewer);
      if (!compact.ok) return compact;
      if (compact.value) comments.push(compact.value);
    }
    if (comments.length > 0) {
      comments.sort((left, right) => String(left.id).localeCompare(String(right.id)));
      threads.push({ id: thread.id, resolved: thread.isResolved, comments });
    }
  }
  const summaries = [];
  for (const summary of input.summaries) {
    const compact = compactTaggedSummary(summary, input.reviewer);
    if (!compact.ok) return compact;
    if (compact.value) summaries.push(compact.value);
  }
  threads.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  summaries.sort((left, right) => left.id - right.id);
  return ok({
    source: { repository: input.repository, pull_number: input.pullNumber, head_oid: input.headOid },
    reviewer: { login: input.reviewer.login, id: input.reviewer.id },
    threads,
    summaries,
  });
}
