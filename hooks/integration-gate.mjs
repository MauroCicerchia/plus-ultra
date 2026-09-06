#!/usr/bin/env node
// PreToolUse (Bash): require a human before recognized integration commands.
import { spawnSync } from "node:child_process";
import { allow, debug, deny, projectRoot, readInput } from "./_lib.mjs";

const MAX_COMMAND_LENGTH = 100_000;
const MAX_PARSE_DEPTH = 8;

function executableName(value) {
  return String(value).replace(/\/+$/, "").split("/").pop();
}

function isAssignment(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(value);
}

function isPreview(tokens) {
  return tokens.some(({ value }) => /^(?:--help|-h|--dry-run(?:=.+)?)$/.test(value));
}

function readBackticks(source, start) {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === "`") {
      return { content: source.slice(start + 1, index), end: index + 1 };
    }
  }
  throw new Error("unclosed backticks");
}

function readCommandSubstitution(source, start) {
  let depth = 1;
  let state = "plain";

  for (let index = start + 2; index < source.length; index += 1) {
    const char = source[index];
    if (state === "single") {
      if (char === "'") state = "plain";
      continue;
    }
    if (state === "double") {
      if (char === "\\") {
        index += 1;
      } else if (char === '"') {
        state = "plain";
      }
      continue;
    }
    if (char === "\\") {
      index += 1;
    } else if (char === "'") {
      state = "single";
    } else if (char === '"') {
      state = "double";
    } else if (char === "`") {
      index = readBackticks(source, index).end - 1;
    } else if (char === "$" && source[index + 1] === "(") {
      depth += 1;
      index += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return { content: source.slice(start + 2, index), end: index + 1 };
    }
  }
  throw new Error("unclosed command substitution");
}

function parseShell(source) {
  const commands = [];
  const substitutions = [];
  let tokens = [];
  let value = "";
  let started = false;
  let quoted = false;
  let state = "plain";

  const finishToken = () => {
    if (started) tokens.push({ value, quoted });
    value = "";
    started = false;
    quoted = false;
  };
  const finishCommand = () => {
    finishToken();
    if (tokens.length) commands.push(tokens);
    tokens = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (state === "single") {
      if (char === "'") {
        state = "plain";
      } else {
        value += char;
      }
      continue;
    }
    if (state === "double") {
      if (char === "\\") {
        if (index + 1 >= source.length) throw new Error("trailing escape");
        value += source[index + 1];
        index += 1;
      } else if (char === '"') {
        state = "plain";
      } else if (char === "$" && source[index + 1] === "(") {
        const substitution = readCommandSubstitution(source, index);
        substitutions.push(substitution.content);
        started = true;
        quoted = true;
        index = substitution.end - 1;
      } else if (char === "`") {
        const substitution = readBackticks(source, index);
        substitutions.push(substitution.content);
        started = true;
        quoted = true;
        index = substitution.end - 1;
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\\") {
      if (index + 1 >= source.length) throw new Error("trailing escape");
      value += source[index + 1];
      started = true;
      index += 1;
    } else if (char === "'") {
      state = "single";
      started = true;
      quoted = true;
    } else if (char === '"') {
      state = "double";
      started = true;
      quoted = true;
    } else if (char === "$" && source[index + 1] === "(") {
      const substitution = readCommandSubstitution(source, index);
      substitutions.push(substitution.content);
      started = true;
      index = substitution.end - 1;
    } else if (char === "`") {
      const substitution = readBackticks(source, index);
      substitutions.push(substitution.content);
      started = true;
      index = substitution.end - 1;
    } else if (/\s/.test(char)) {
      finishToken();
    } else if (";|&()".includes(char)) {
      finishCommand();
      if ((char === "|" || char === "&") && source[index + 1] === char) index += 1;
    } else {
      value += char;
      started = true;
    }
  }
  if (state !== "plain") throw new Error("unclosed quote");
  finishCommand();
  return { commands, substitutions };
}

function skipOptions(tokens, index, optionsWithValue = new Set()) {
  let cursor = index;
  while (cursor < tokens.length) {
    const value = tokens[cursor].value;
    if (value === "--") return cursor + 1;
    if (!value.startsWith("-")) return cursor;
    cursor += 1;
    if (optionsWithValue.has(value) && !value.includes("=")) cursor += 1;
  }
  return cursor;
}

function unwrapCommand(tokens) {
  let index = 0;
  while (index < tokens.length && isAssignment(tokens[index].value)) index += 1;

  for (;;) {
    const name = executableName(tokens[index]?.value);
    if (name === "env") {
      index += 1;
      index = skipOptions(tokens, index, new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]));
      while (index < tokens.length && isAssignment(tokens[index].value)) index += 1;
    } else if (name === "command") {
      index = skipOptions(tokens, index + 1);
    } else if (name === "sudo") {
      index = skipOptions(
        tokens,
        index + 1,
        new Set(["-u", "-g", "-h", "-p", "-r", "-t", "-C", "--user", "--group", "--host", "--prompt", "--role", "--type", "--chdir"])
      );
    } else if (name === "nice" || name === "time" || name === "nohup") {
      index = skipOptions(tokens, index + 1, new Set(["-n", "--adjustment", "-f", "--format", "-o", "--output"]));
    } else if (name === "timeout") {
      index = skipOptions(tokens, index + 1, new Set(["-k", "--kill-after", "-s", "--signal"]));
      if (index < tokens.length) index += 1;
    } else if (name === "xargs") {
      index = skipOptions(
        tokens,
        index + 1,
        new Set(["-n", "--max-args", "-L", "--max-lines", "-s", "--max-chars", "-I", "--replace", "-E", "--eof", "-d", "--delimiter", "-a", "--arg-file", "-P", "--max-procs"])
      );
    } else {
      return { index, name };
    }
  }
}

function ghApiIntegration(args) {
  let endpoint = "";
  let method = "";
  let hasFields = false;
  const fieldFlags = new Set(["-f", "-F", "--raw-field", "--field", "--input"]);
  const optionsWithValue = new Set(["--hostname", "--cache", "--jq", "-q", "--template", "-t", "--preview", "-p", "--header", "-H"]);

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index].value;
    if (value === "--method" || value === "-X") {
      method = String(args[index + 1]?.value ?? "").toUpperCase();
      index += 1;
    } else if (value.startsWith("--method=")) {
      method = value.slice("--method=".length).toUpperCase();
    } else if (/^-X[A-Za-z]+$/.test(value)) {
      method = value.slice(2).toUpperCase();
    } else if (fieldFlags.has(value)) {
      hasFields = true;
      index += 1;
    } else if (optionsWithValue.has(value)) {
      index += 1;
    } else if (value.startsWith("-")) {
      // Option values cannot be an endpoint unless they follow an option handled above.
    } else if (!endpoint) {
      endpoint = value;
    }
  }

  const body = args.map(({ value }) => value).join(" ");
  const mutating = method ? !["GET", "HEAD", "OPTIONS"].includes(method) : hasFields;
  const route = endpoint.replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "").toLowerCase();
  if (endpoint.toLowerCase() === "graphql") {
    if (!/\bmutation\b/i.test(body)) return null;
    if (/\b(?:mergePullRequest|enablePullRequestAutoMerge|disablePullRequestAutoMerge|enqueuePullRequest|dequeuePullRequest)\b/i.test(body)) {
      return "pull-request merge or merge-queue mutation";
    }
    if (/\b(?:createRelease|updateRelease|deleteRelease)\b/i.test(body)) return "release mutation";
    if (/\b(?:createRef|updateRef|deleteRef)\b/i.test(body) && /refs\/tags\//i.test(body)) {
      return "tag publication mutation";
    }
    return null;
  }
  if (!mutating) return null;
  if (/(?:^|\/)pulls\/[^/]+\/(?:merge|auto-merge)(?:\/|$)/.test(route)) {
    return "pull-request merge mutation";
  }
  if (/(?:^|\/)merge-queues?(?:\/|$)/.test(route)) return "merge-queue mutation";
  if (/(?:^|\/)releases?(?:\/|$)/.test(route)) return "release mutation";
  if (/(?:^|\/)git\/refs(?:\/|$)/.test(route) && /refs\/tags\//i.test(`${route} ${body}`)) {
    return "tag publication mutation";
  }
  return null;
}

function ghIntegration(tokens, index) {
  const args = tokens.slice(index + 1);
  if (isPreview(args)) return null;
  if (args[0]?.value === "api") return ghApiIntegration(args);
  const [group, action] = args.map(({ value }) => value);
  if (group === "pr" && action === "merge") return "pull-request merge";
  if (group === "stack" && action === "merge") return "stack merge";
  if (group === "release" && action === "create") return "release publication";
  return null;
}

function localGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 1_000 });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function protectedBranches(root) {
  const branches = new Set(["main", "master"]);
  try {
    const refs = localGit(root, ["for-each-ref", "--format=%(symref)", "refs/remotes"]);
    if (!refs) return branches;
    for (const ref of refs.split(/\r?\n/)) {
      const match = ref.match(/^refs\/remotes\/[^/]+\/(.+)$/);
      if (match) branches.add(match[1]);
    }
  } catch {
    // Local-ref discovery is advisory; main and master remain protected fallbacks.
  }
  return branches;
}

function localTags(root) {
  try {
    const output = localGit(root, ["tag", "--list"]);
    return new Set(output ? output.split(/\r?\n/).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function pushPositionals(args) {
  const positional = [];
  const optionsWithValue = new Set(["--receive-pack", "--exec", "--push-option", "-o"]);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index].value;
    if (value === "--") {
      positional.push(...args.slice(index + 1).map(({ value: argument }) => argument));
      break;
    }
    if (value.startsWith("-")) {
      if (optionsWithValue.has(value)) index += 1;
      continue;
    }
    positional.push(value);
  }
  return positional;
}

function pushedRefTarget(refspec) {
  const normalized = refspec.replace(/^\+/, "");
  const colon = normalized.indexOf(":");
  const target = colon === -1 ? normalized : normalized.slice(colon + 1);
  if (target.startsWith("refs/heads/")) return target.slice("refs/heads/".length);
  const remote = target.match(/^refs\/remotes\/[^/]+\/(.+)$/);
  return remote ? remote[1] : target;
}

function gitIntegration(tokens, index, root) {
  const args = tokens.slice(index + 1).map(({ value }) => value);
  if (args[0] !== "push" || isPreview(tokens.slice(index + 1))) return null;
  const pushArgs = args.slice(1);
  if (pushArgs.some((value) => ["--all", "--mirror"].includes(value))) {
    return "broad branch push";
  }
  if (pushArgs.some((value) => ["--tags", "--follow-tags"].includes(value))) {
    return "tag publication";
  }

  const positional = pushPositionals(tokens.slice(index + 2));
  const refspecs = positional.length > 1 ? positional.slice(1) : [];
  if (refspecs[0] === "tag" && refspecs[1]) return "tag publication";

  const branches = protectedBranches(root);
  const tags = localTags(root);
  for (const refspec of refspecs) {
    if (refspec.includes("refs/tags/")) return "tag publication";
    const target = pushedRefTarget(refspec);
    if (branches.has(target)) return `push to protected branch ${target}`;
    if (!refspec.includes(":") && tags.has(target)) return "tag publication";
  }
  return null;
}

function classifyTokens(tokens, depth, root) {
  if (!tokens.length || depth > MAX_PARSE_DEPTH) return null;
  const first = tokens[0];
  if (first.quoted && /\s/.test(first.value)) return null;

  const { index, name } = unwrapCommand(tokens);
  if (!name) return null;
  if (["sh", "bash", "zsh"].includes(name)) {
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const value = tokens[cursor].value;
      if (value === "-c" || (/^-[^-]+$/.test(value) && value.includes("c"))) {
        return classify(tokens[cursor + 1]?.value ?? "", depth + 1, root);
      }
    }
    return null;
  }
  if (name === "eval") {
    return classify(tokens.slice(index + 1).map(({ value }) => value).join(" "), depth + 1, root);
  }
  if (name === "gh") return ghIntegration(tokens, index);
  if (name === "git") return gitIntegration(tokens, index, root);
  return null;
}

function classify(source, depth = 0, root) {
  if (depth > MAX_PARSE_DEPTH || source.length > MAX_COMMAND_LENGTH) return null;
  const { commands, substitutions } = parseShell(source);
  for (const substitution of substitutions) {
    const result = classify(substitution, depth + 1, root);
    if (result) return result;
  }
  for (const tokens of commands) {
    const result = classifyTokens(tokens, depth, root);
    if (result) return result;
  }
  return null;
}

const input = await readInput();
debug("integration-gate", input);

try {
  const command = String(input?.tool_input?.command ?? "");
  const operation = command.trim() ? classify(command, 0, projectRoot(input)) : null;
  if (operation) {
    deny(
      `Blocked integration command by plus-ultra: "${command}". A human must perform this ${operation}.`
    );
  }
} catch {
  // Hooks fail open when a command is malformed or cannot be classified safely.
}

allow();
