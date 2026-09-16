import { spawnSync } from "node:child_process";

const failure = (code, message) => ({ ok: false, error: { code, message } });
const ok = (value) => ({ ok: true, value });

function runGh(args) {
  const result = spawnSync(process.env.GH_BIN ?? "gh", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return failure("github_request_failed", `GitHub request failed: gh ${args.slice(0, 3).join(" ")}`);
  }
  try {
    return ok(JSON.parse(result.stdout));
  } catch {
    return failure("malformed_github_response", `GitHub returned invalid JSON for: gh ${args.slice(0, 3).join(" ")}`);
  }
}

function contentText(file) {
  if (file?.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") {
    return failure("malformed_github_response", "GitHub spec content must be a base64 file payload");
  }
  try {
    return ok(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8"));
  } catch {
    return failure("malformed_github_response", "GitHub returned invalid base64 spec content");
  }
}

export function fetchPullRequest(repository, number) {
  return runGh([
    "pr",
    "view",
    String(number),
    "--repo",
    repository,
    "--json",
    "number,url,state,baseRefName,baseRefOid,headRefName,headRefOid,headRepository,closingIssuesReferences",
  ]);
}

export function fetchComparison(repository, baseOid, headOid) {
  return runGh(["api", `repos/${repository}/compare/${baseOid}...${headOid}`]);
}

export function fetchPullFiles(repository, pullNumber) {
  const result = runGh([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repository}/pulls/${pullNumber}/files?per_page=100`,
  ]);
  if (!result.ok) return result;
  if (!Array.isArray(result.value) || result.value.some((page) => !Array.isArray(page))) {
    return failure("malformed_github_response", "GitHub changed-file pagination is incomplete");
  }
  return ok(result.value.flat());
}

export function fetchRemoteSpecs(repository, ref) {
  const listed = runGh(["api", `repos/${repository}/contents/specs?ref=${ref}`]);
  if (!listed.ok) return listed;
  if (!Array.isArray(listed.value)) {
    return failure("malformed_github_response", "GitHub spec listing must be an array");
  }
  const entries = listed.value.filter((entry) => entry?.type === "file" && /^specs\/\d{3}-.+\.md$/.test(entry.path));
  const files = [];
  for (const entry of entries) {
    if (typeof entry.sha !== "string") {
      return failure("malformed_github_response", "GitHub spec listing has a file without SHA");
    }
    const content = runGh(["api", `repos/${repository}/contents/${entry.path}?ref=${ref}`]);
    if (!content.ok) return content;
    const text = contentText(content.value);
    if (!text.ok) return text;
    files.push({ path: entry.path, sha: entry.sha, content: text.value });
  }
  return ok(files);
}

export function fetchReviewer() {
  return runGh(["api", "user"]);
}

const reviewThreadQuery = `query ReviewThreads($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        nodes {
          id
          isResolved
          comments(first: 100) {
            nodes { id databaseId url author { login } body path line originalLine diffSide updatedAt }
            pageInfo { hasNextPage endCursor }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

export function fetchReviewThreads(repository, pullNumber) {
  const [owner, name] = repository.split("/");
  const threads = [];
  const seenCursors = new Set();
  let cursor;
  do {
    const args = [
      "api",
      "graphql",
      "--method",
      "GET",
      "-f",
      `query=${reviewThreadQuery}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `name=${name}`,
      "-F",
      `number=${pullNumber}`,
    ];
    if (cursor) args.push("-F", `cursor=${cursor}`);
    const page = runGh(args);
    if (!page.ok) return page;
    const connection = page.value?.data?.repository?.pullRequest?.reviewThreads;
    if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean") {
      return failure("malformed_github_response", "GitHub review-thread pagination is incomplete");
    }
    for (const thread of connection.nodes) {
      const commentPage = thread?.comments?.pageInfo;
      if (!commentPage || commentPage.hasNextPage !== false) {
        return failure("malformed_github_response", "GitHub review-thread comment pagination is incomplete");
      }
      threads.push(thread);
    }
    if (connection.pageInfo.hasNextPage && typeof connection.pageInfo.endCursor !== "string") {
      return failure("malformed_github_response", "GitHub review-thread page has no next cursor");
    }
    if (connection.pageInfo.hasNextPage && seenCursors.has(connection.pageInfo.endCursor)) {
      return failure("malformed_github_response", "GitHub review-thread pagination repeated a cursor");
    }
    if (connection.pageInfo.hasNextPage) seenCursors.add(connection.pageInfo.endCursor);
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : undefined;
  } while (cursor);
  return ok(threads);
}

export function fetchSummaryComments(repository, pullNumber) {
  const result = runGh([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repository}/issues/${pullNumber}/comments?per_page=100`,
  ]);
  if (!result.ok) return result;
  if (!Array.isArray(result.value) || result.value.some((page) => !Array.isArray(page))) {
    return failure("malformed_github_response", "GitHub summary-comment pagination is incomplete");
  }
  return ok(result.value.flat());
}

export function fetchCommentEvidence(repository, pullNumber, kind, id) {
  const endpoint =
    kind === "inline"
      ? `repos/${repository}/pulls/comments/${id}`
      : `repos/${repository}/issues/comments/${id}`;
  return runGh(["api", endpoint]);
}
