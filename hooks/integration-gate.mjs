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
  let wordStarted = false;

  for (let index = start + 2; index < source.length; index += 1) {
    const char = source[index];
    if (state === "comment") {
      if (char === "\n") {
        state = "plain";
        wordStarted = false;
      }
      continue;
    }
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
      wordStarted = source[index + 1] !== "\n";
      index += 1;
    } else if (char === "'") {
      state = "single";
      wordStarted = true;
    } else if (char === '"') {
      state = "double";
      wordStarted = true;
    } else if (char === "#" && !wordStarted) {
      state = "comment";
    } else if (char === "`") {
      index = readBackticks(source, index).end - 1;
    } else if (char === "$" && source[index + 1] === "(") {
      depth += 1;
      index += 1;
      wordStarted = true;
    } else if (char === "(") {
      depth += 1;
      wordStarted = false;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return { content: source.slice(start + 2, index), end: index + 1 };
      wordStarted = false;
    } else if (/\s/.test(char) || ";|&".includes(char)) {
      wordStarted = false;
    } else {
      wordStarted = true;
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
        if (value === "--help") return { tokens, index, name: "" };
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
    const operationName = fields.filter((field) => field.startsWith("operationName=")).at(-1)?.slice("operationName=".length) ?? "";
    const operation = selectedGraphqlMutation(query, operationName);
    if (!operation) return null;
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

function maskGraphqlDocument(source) {
  let masked = "";
  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith('"""', index)) {
      const end = source.indexOf('"""', index + 3);
      if (end === -1) throw new Error("unclosed GraphQL block string");
      masked += source.slice(index, end + 3).replace(/[^\n]/g, " ");
      index = end + 2;
    } else if (source[index] === '"') {
      const start = index;
      for (index += 1; index < source.length; index += 1) {
        if (source[index] === "\\") {
          index += 1;
        } else if (source[index] === '"') {
          break;
        }
      }
      if (index >= source.length) throw new Error("unclosed GraphQL string");
      masked += source.slice(start, index + 1).replace(/[^\n]/g, " ");
    } else if (source[index] === "#") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      masked += source.slice(index, stop).replace(/[^\n]/g, " ");
      index = stop - 1;
    } else {
      masked += source[index];
    }
  }
  return masked;
}

function graphqlName(source, index) {
  const match = source.slice(index).match(/^[_A-Za-z][_0-9A-Za-z]*/);
  return match ? { value: match[0], end: index + match[0].length } : null;
}

function skipGraphqlWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function graphqlSelectionStart(source, index) {
  let parentheses = 0;
  let brackets = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === "(") parentheses += 1;
    else if (char === ")") parentheses -= 1;
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets -= 1;
    else if (char === "{" && parentheses === 0 && brackets === 0) return cursor;
  }
  throw new Error("GraphQL operation without a selection set");
}

function graphqlSelection(source, start) {
  let depth = 1;
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) {
      return { content: source.slice(start + 1, index), end: index + 1 };
    }
  }
  throw new Error("unclosed GraphQL selection set");
}

function parseGraphqlDocument(source) {
  const code = maskGraphqlDocument(source);
  const operations = [];
  const fragments = new Map();
  for (let index = 0; index < code.length;) {
    index = skipGraphqlWhitespace(code, index);
    if (index >= code.length) break;
    if (code[index] === "{") {
      const selection = graphqlSelection(code, index);
      operations.push({ type: "query", name: "", content: selection.content });
      index = selection.end;
      continue;
    }
    const definition = graphqlName(code, index);
    if (!definition) {
      index += 1;
      continue;
    }
    index = definition.end;
    const afterKeyword = skipGraphqlWhitespace(code, index);
    const name = graphqlName(code, afterKeyword);
    const selectionStart = graphqlSelectionStart(code, afterKeyword);
    const selection = graphqlSelection(code, selectionStart);
    if (["query", "mutation", "subscription"].includes(definition.value)) {
      operations.push({
        type: definition.value,
        name: name && name.end <= selectionStart ? name.value : "",
        content: selection.content,
      });
    } else if (definition.value === "fragment" && name) {
      fragments.set(name.value, selection.content);
    }
    index = selection.end;
  }
  return { operations, fragments };
}

function selectedGraphqlMutation(query, operationName) {
  const { operations, fragments } = parseGraphqlDocument(query);
  const selected = operationName
    ? operations.find((operation) => operation.name === operationName)
    : operations.length === 1 ? operations[0] : null;
  if (!selected || selected.type !== "mutation") return null;

  const content = [selected.content];
  const visited = new Set();
  for (let index = 0; index < content.length; index += 1) {
    for (const match of content[index].matchAll(/\.\.\.\s*([_A-Za-z][_0-9A-Za-z]*)/g)) {
      const fragment = fragments.get(match[1]);
      if (fragment && !visited.has(match[1])) {
        visited.add(match[1]);
        content.push(fragment);
      }
    }
  }
  return content.join(" ");
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

function pushOptionEnabled(options, flag) {
  let enabled = false;
  const negated = `--no-${flag.slice(2)}`;
  for (const [option] of options) {
    if (option === flag) enabled = true;
    if (option === negated) enabled = false;
  }
  return enabled;
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
  if (["--all", "--mirror", "--branches"].some((flag) => pushOptionEnabled(options, flag))) {
    return "broad branch push";
  }
  if (["--tags", "--follow-tags"].some((flag) => pushOptionEnabled(options, flag))) {
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
    const rawTarget = refspec.replace(/^\+/, "").split(":").at(-1);
    let target = pushedRefTarget(refspec);
    if (!refspec.includes(":") && target === "HEAD") target = current;
    if (branches.has(target)) return `push to protected branch ${target}`;
    if (target?.includes("*")) {
      const pattern = new RegExp(`^${target.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      if ([...branches].some((branch) => pattern.test(branch) || pattern.test(`refs/heads/${branch}`))) return "push matching a protected branch";
    }
    if (rawTarget.startsWith("refs/tags/") || (!rawTarget.startsWith("refs/heads/") && tags.has(target))) return "tag publication";
  }
  return null;
}

function shellIntegration(tokens, index, depth, root) {
  let syntaxOnly = false;
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    const value = tokens[cursor].value;
    if (value === "--" || !value.startsWith("-")) return null;
    if (value === "--help") return null;
    if (value === "--noexec") {
      syntaxOnly = true;
      continue;
    }
    if (value === "-o" && tokens[cursor + 1]?.value === "noexec") {
      syntaxOnly = true;
      cursor += 1;
      continue;
    }
    if (/^-[^-]+$/.test(value)) {
      const flags = value.slice(1);
      if (flags.includes("n")) syntaxOnly = true;
      if (flags.includes("c")) {
        return syntaxOnly ? null : classify(tokens[cursor + 1]?.value ?? "", depth + 1, root);
      }
    }
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
    return shellIntegration(tokens, index, depth, root);
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
