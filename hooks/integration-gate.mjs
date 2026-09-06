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

// Only recognize flags after consuming their values and respecting `--`.
function parseOptions(args, optionsWithValue, stopAtPositional = false) {
  const options = [];
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (!value.startsWith("-") || value === "-") {
      if (stopAtPositional) {
        positional.push(...args.slice(index));
        break;
      }
      positional.push(value);
    } else if (value.startsWith("--")) {
      const equals = value.indexOf("=");
      const flag = equals === -1 ? value : value.slice(0, equals);
      const argument = equals !== -1 ? value.slice(equals + 1)
        : optionsWithValue.has(flag) ? args[++index] ?? "" : true;
      options.push([flag, argument]);
    } else {
      for (let cursor = 1; cursor < value.length; cursor += 1) {
        const flag = `-${value[cursor]}`;
        if (optionsWithValue.has(flag)) {
          options.push([flag, value.slice(cursor + 1) || args[++index] || ""]);
          break;
        }
        options.push([flag, true]);
      }
    }
  }
  return { options, positional };
}

function isPreview(options, shortDryRun = false) {
  let dryRun = false;
  for (const [flag, value] of options) {
    if ((flag === "--help" || flag === "-h") && (value === true || value === "true")) return true;
    if (flag === "--dry-run" || (shortDryRun && flag === "-n")) dryRun = value === true || value === "true";
    if (flag === "--no-dry-run") dryRun = false;
  }
  return dryRun;
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

function heredocSubstitutions(source) {
  const substitutions = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
    } else if (source[index] === "`" || (source[index] === "$" && source[index + 1] === "(")) {
      const substitution = source[index] === "`"
        ? readBackticks(source, index) : readCommandSubstitution(source, index);
      substitutions.push(substitution.content);
      index = substitution.end - 1;
    }
  }
  return substitutions;
}

function parseShell(source, wordsOnly = false) {
  const commands = [];
  const substitutions = [];
  let tokens = [];
  let value = "";
  let started = false;
  let quoted = false;
  let state = "plain";
  let heredoc = null;
  const pendingHeredocs = [];

  const finishToken = () => {
    if (started) {
      if (heredoc) {
        pendingHeredocs.push({ ...heredoc, delimiter: value, quoted });
        heredoc = null;
      } else {
        tokens.push({ value, quoted });
      }
    }
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
        if (source[index + 1] !== "\n") {
          if (!'$`"\\'.includes(source[index + 1])) value += "\\";
          value += source[index + 1];
        }
        index += 1;
      } else if (char === '"') {
        state = "plain";
      } else if (!wordsOnly && !heredoc && char === "$" && source[index + 1] === "(") {
        const substitution = readCommandSubstitution(source, index);
        substitutions.push(substitution.content);
        started = true;
        quoted = true;
        index = substitution.end - 1;
      } else if (!wordsOnly && !heredoc && char === "`") {
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
      if (source[index + 1] !== "\n") {
        value += source[index + 1];
        started = true;
        quoted = true;
      }
      index += 1;
    } else if (char === "'") {
      state = "single";
      started = true;
      quoted = true;
    } else if (char === '"') {
      state = "double";
      started = true;
      quoted = true;
    } else if (!wordsOnly && !heredoc && char === "$" && source[index + 1] === "(") {
      const substitution = readCommandSubstitution(source, index);
      substitutions.push(substitution.content);
      started = true;
      index = substitution.end - 1;
    } else if (!wordsOnly && !heredoc && char === "`") {
      const substitution = readBackticks(source, index);
      substitutions.push(substitution.content);
      started = true;
      index = substitution.end - 1;
    } else if (!wordsOnly && char === "#" && !started) {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end - 1;
    } else if (!wordsOnly && source.startsWith("<<<", index)) {
      finishToken();
      index += 2;
    } else if (!wordsOnly && source.startsWith("<<", index)) {
      finishToken();
      const stripTabs = source[index + 2] === "-";
      heredoc = { stripTabs };
      index += stripTabs ? 2 : 1;
    } else if (!wordsOnly && char === "\n") {
      finishCommand();
      for (const document of pendingHeredocs.splice(0)) {
        const start = index + 1;
        let cursor = start;
        for (;;) {
          if (cursor >= source.length) throw new Error("unclosed heredoc");
          const newline = source.indexOf("\n", cursor);
          const end = newline === -1 ? source.length : newline;
          const line = source.slice(cursor, end);
          if ((document.stripTabs ? line.replace(/^\t+/, "") : line) === document.delimiter) {
            if (!document.quoted) substitutions.push(...heredocSubstitutions(source.slice(start, cursor)));
            index = end;
            break;
          }
          cursor = end + 1;
        }
      }
    } else if (/\s/.test(char)) {
      finishToken();
    } else if (!wordsOnly && ";|&()".includes(char)) {
      finishCommand();
      if ((char === "|" || char === "&") && source[index + 1] === char) index += 1;
    } else {
      value += char;
      started = true;
    }
  }
  if (state !== "plain") throw new Error("unclosed quote");
  finishCommand();
  if (heredoc || pendingHeredocs.length) throw new Error("unclosed heredoc");
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
  tokens = [...tokens];
  let index = 0;
  let splits = 0;
  while (index < tokens.length && isAssignment(tokens[index].value)) index += 1;

  for (;;) {
    const name = executableName(tokens[index]?.value);
    if (name === "env") {
      index += 1;
      while (tokens[index]?.value.startsWith("-")) {
        const value = tokens[index].value;
        if (value === "--") {
          index += 1;
          break;
        }
        if (value === "-S" || value === "--split-string" || value.startsWith("--split-string=") || value.startsWith("-S")) {
          if (++splits > MAX_PARSE_DEPTH) throw new Error("too many env splits");
          const separate = value === "-S" || value === "--split-string";
          const source = separate ? tokens[index + 1]?.value ?? ""
            : value.startsWith("-S") ? value.slice(2) : value.slice("--split-string=".length);
          const split = parseShell(source, true).commands.flat();
          tokens.splice(index, separate ? 2 : 1, ...split);
        } else {
          index += ["-u", "--unset", "-C", "--chdir"].includes(value) ? 2 : 1;
        }
      }
      while (index < tokens.length && isAssignment(tokens[index].value)) index += 1;
    } else if (name === "command") {
      const end = skipOptions(tokens, index + 1);
      if (tokens.slice(index + 1, end).some(({ value }) => /^-[^-]*[vV]/.test(value))) return { tokens, index, name: "" };
      index = end;
    } else if (name === "sudo") {
      index = skipOptions(
        tokens,
        index + 1,
        new Set(["-u", "-g", "-h", "-p", "-r", "-t", "-C", "--user", "--group", "--host", "--prompt", "--role", "--type", "--chdir"])
      );
      while (index < tokens.length && isAssignment(tokens[index].value)) index += 1;
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
      return { tokens, index, name };
    }
  }
}

function ghApiIntegration(endpoint, options) {
  const fields = options.filter(([flag]) => ["-f", "-F", "--raw-field", "--field"].includes(flag)).map(([, value]) => String(value));
  const hasFields = fields.length > 0 || options.some(([flag]) => flag === "--input");
  const methods = options.filter(([flag]) => flag === "-X" || flag === "--method");
  const method = String(methods.at(-1)?.[1] ?? "").toUpperCase();
  const body = fields.join(" ");
  const mutating = method ? !["GET", "HEAD", "OPTIONS"].includes(method) : hasFields;
  const route = endpoint.replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "").toLowerCase();
  if (endpoint.toLowerCase() === "graphql") {
    const query = fields.filter((field) => field.startsWith("query=")).at(-1)?.slice(6) ?? "";
    const operation = query.replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|#[^\n]*/g, " ");
    if (!/^\s*mutation\b/.test(operation)) return null;
    if (/\b(?:mergePullRequest|enablePullRequestAutoMerge|disablePullRequestAutoMerge|enqueuePullRequest|dequeuePullRequest)\s*\(/.test(operation)) {
      return "pull-request merge or merge-queue mutation";
    }
    if (/\b(?:createRelease|updateRelease|deleteRelease)\s*\(/.test(operation)) return "release mutation";
    if (/\b(?:createRef|updateRef|deleteRef)\s*\(/.test(operation) && /refs\/tags\//i.test(body)) {
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
  const globalFlags = ["-R", "--repo", "--hostname"];
  const global = parseOptions(tokens.slice(index + 1).map(({ value }) => value), new Set(globalFlags), true);
  const valueFlags = {
    api: ["-X", "--method", "-f", "-F", "--field", "--raw-field", "--input", "--cache", "--jq", "-q", "--template", "-t", "--preview", "-p", "--header", "-H"],
    release: ["--notes", "-n", "--notes-file", "-F", "--notes-start-tag", "--title", "-t", "--target", "--discussion-category"],
    pr: ["--body", "-b", "--body-file", "-F", "--subject", "-t", "--author-email", "-A", "--match-head-commit"],
  };
  const { options, positional } = parseOptions(global.positional,
    new Set([...globalFlags, ...(valueFlags[global.positional[0]] ?? [])]));
  if (isPreview([...global.options, ...options])) return null;
  const [group, action] = positional;
  if (group === "api") return ghApiIntegration(action ?? "", options);
  if (group === "pr" && action === "merge") return "pull-request merge";
  if (group === "stack" && action === "merge") return "stack merge";
  if (group === "release" && action === "create") return "release publication";
  return null;
}

function localGit(root, args) {
  const result = spawnSync("git", [...(root.options ?? []), ...args], {
    cwd: root.cwd ?? root, encoding: "utf8", timeout: 1_000,
  });
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

function pushedRefTarget(refspec) {
  const normalized = refspec.replace(/^\+/, "");
  const colon = normalized.indexOf(":");
  const target = colon === -1 ? normalized : normalized.slice(colon + 1);
  if (target.startsWith("refs/heads/")) return target.slice("refs/heads/".length);
  const remote = target.match(/^refs\/remotes\/[^/]+\/(.+)$/);
  return remote ? remote[1] : target;
}

function gitIntegration(tokens, index, root) {
  const global = parseOptions(tokens.slice(index + 1).map(({ value }) => value),
    new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path"]), true);
  if (global.positional[0] !== "push" || isPreview(global.options)) return null;
  // Pass only repository selectors to local discovery; never execute the inspected command.
  const context = {
    cwd: root,
    options: global.options.filter(([flag]) => ["-C", "--git-dir", "--work-tree", "--namespace"].includes(flag)).flat(),
  };
  const { options, positional } = parseOptions(global.positional.slice(1),
    new Set(["--repo", "--receive-pack", "--exec", "--push-option", "-o", "--recurse-submodules"]));
  if (isPreview(options, true)) return null;
  if (options.some(([flag]) => ["--all", "--mirror", "--branches"].includes(flag))) {
    return "broad branch push";
  }
  if (options.some(([flag]) => ["--tags", "--follow-tags"].includes(flag))) {
    return "tag publication";
  }

  const refspecs = options.some(([flag]) => flag === "--repo") ? positional : positional.slice(1);
  if (refspecs.some((refspec, cursor) => refspec === "tag" && refspecs[cursor + 1])) return "tag publication";

  const branches = protectedBranches(context);
  const tags = localTags(context);
  const current = localGit(context, ["symbolic-ref", "--quiet", "--short", "HEAD"])?.trim();
  if (!refspecs.length && current && branches.has(current)) return `push to protected branch ${current}`;
  for (const refspec of refspecs) {
    if (refspec.replace(/^\+/, "") === ":") return "broad branch push";
    if (refspec.includes("refs/tags/")) return "tag publication";
    const rawTarget = refspec.replace(/^\+/, "").split(":").at(-1);
    const source = refspec.replace(/^\+/, "").split(":")[0];
    let target = pushedRefTarget(refspec);
    if (!refspec.includes(":") && target === "HEAD") target = current;
    if (branches.has(target)) return `push to protected branch ${target}`;
    if (target?.includes("*")) {
      const pattern = new RegExp(`^${target.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      if ([...branches].some((branch) => pattern.test(branch) || pattern.test(`refs/heads/${branch}`))) return "push matching a protected branch";
    }
    if (!rawTarget.startsWith("refs/heads/") && (tags.has(target) || tags.has(source))) return "tag publication";
  }
  return null;
}

function classifyTokens(tokens, depth, root) {
  if (!tokens.length || depth > MAX_PARSE_DEPTH) return null;

  const unwrapped = unwrapCommand(tokens);
  const { index, name } = unwrapped;
  tokens = unwrapped.tokens;
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
