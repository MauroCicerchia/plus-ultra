import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePackaging } from "./validate-packaging.mjs";

const developmentMarketplace = "plus-ultra-dev";
const stableMarketplace = "plus-ultra";
const stableSource = "maurocicerchia/plus-ultra";
const manifestPaths = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
];

function fail(message) {
  throw new Error(message);
}

function runCodex(args, { allowFailure = false } = {}) {
  const result = spawnSync(process.env.CODEX_BIN ?? "codex", args, { encoding: "utf8" });
  if (result.error) fail(`Could not run Codex: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    fail(`Codex command failed: codex ${args.join(" ")}\n${result.stderr || result.stdout}`.trim());
  }
  return result;
}

function listMarketplaces() {
  const result = runCodex(["plugin", "marketplace", "list", "--json"]);
  try {
    const payload = JSON.parse(result.stdout);
    return Array.isArray(payload.marketplaces) ? payload.marketplaces : [];
  } catch {
    fail("Codex returned invalid marketplace JSON");
  }
}

function managedStage(root) {
  return join(root, ".context", "codex-dev-marketplace");
}

function hasManagedRoot(entry, stage) {
  if (typeof entry?.root !== "string") return false;
  const canonical = (path) => (existsSync(path) ? realpathSync(path) : resolve(path));
  return canonical(entry.root) === canonical(stage);
}

function requireNoForeignDevelopmentMarketplace(marketplaces, stage) {
  const development = marketplaces.find((entry) => entry?.name === developmentMarketplace);
  if (development && !hasManagedRoot(development, stage)) {
    fail(
      `Refusing to replace ${developmentMarketplace}: it points to another plugin root (${development.root}).`
    );
  }
  return development;
}

function trackedAndUnignoredPaths(root) {
  try {
    return execFileSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"])
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .filter((path) => ![".git", ".context"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`)));
  } catch {
    fail("Codex local dogfooding requires a readable Git worktree");
  }
}

function copyGitIncludedSource(root, destination) {
  for (const path of trackedAndUnignoredPaths(root)) {
    const source = resolve(root, path);
    const target = resolve(destination, path);
    if (relative(root, source).startsWith("..") || relative(destination, target).startsWith("..")) {
      fail(`Refusing unsafe Git path: ${path}`);
    }
    const stat = lstatSync(source);
    if (!stat.isFile()) continue;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

function timestampFromEnvironment() {
  const configured = process.env.PLUS_ULTRA_CODEX_LOCAL_TIMESTAMP;
  if (configured) {
    if (!/^\d{8}-\d{6}$/.test(configured)) fail("PLUS_ULTRA_CODEX_LOCAL_TIMESTAMP must be YYYYMMDD-HHMMSS");
    return configured;
  }
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
}

function addSeconds(timestamp, seconds) {
  const match = timestamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  const date = new Date(Date.UTC(...match.slice(1).map(Number).map((value, index) => (index === 1 ? value - 1 : value))));
  date.setUTCSeconds(date.getUTCSeconds() + seconds);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(
    date.getUTCHours()
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function readVersion(root) {
  return JSON.parse(readFileSync(join(root, ".codex-plugin", "plugin.json"), "utf8")).version;
}

function uniqueLocalVersion(root, stage) {
  const release = readVersion(root);
  const previousManifest = join(stage, "plugins", "plus-ultra", ".codex-plugin", "plugin.json");
  const previous = existsSync(previousManifest)
    ? JSON.parse(readFileSync(previousManifest, "utf8")).version
    : undefined;
  const initialTimestamp = timestampFromEnvironment();
  let increment = 0;
  let version = `${release}+codex.local-${initialTimestamp}`;
  while (version === previous) {
    increment += 1;
    version = `${release}+codex.local-${addSeconds(initialTimestamp, increment)}`;
  }
  return version;
}

function setStagedVersions(pluginRoot, version) {
  for (const path of manifestPaths) {
    const target = join(pluginRoot, path);
    const manifest = JSON.parse(readFileSync(target, "utf8"));
    manifest.version = version;
    writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function writeDevelopmentMarketplace(stage) {
  const path = join(stage, ".agents", "plugins", "marketplace.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        name: developmentMarketplace,
        interface: { displayName: "Plus Ultra Development" },
        plugins: [
          {
            name: "plus-ultra",
            source: { source: "url", url: "./plugins/plus-ultra" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Developer Tools",
          },
        ],
      },
      null,
      2
    )}\n`
  );
}

function initializeStagedRepository(pluginRoot) {
  try {
    execFileSync("git", ["-C", pluginRoot, "init", "--initial-branch=main"], { stdio: "ignore" });
    execFileSync("git", ["-C", pluginRoot, "config", "user.name", "Plus Ultra dogfooding"], { stdio: "ignore" });
    execFileSync("git", ["-C", pluginRoot, "config", "user.email", "dogfooding@plus-ultra.local"], {
      stdio: "ignore",
    });
    execFileSync("git", ["-C", pluginRoot, "add", "--all"], { stdio: "ignore" });
    execFileSync("git", ["-C", pluginRoot, "commit", "-m", "chore: stage local plugin"], { stdio: "ignore" });
  } catch {
    fail("Could not initialize the staged plugin repository");
  }
}

function buildStaging(root, stage) {
  const parent = dirname(stage);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, ".codex-dev-marketplace-"));
  try {
    const pluginRoot = join(temporary, "plugins", "plus-ultra");
    copyGitIncludedSource(root, pluginRoot);
    setStagedVersions(pluginRoot, uniqueLocalVersion(root, stage));
    initializeStagedRepository(pluginRoot);
    writeDevelopmentMarketplace(temporary);
    return temporary;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function replaceStaging(stage, temporary) {
  const backup = `${stage}.backup-${process.pid}`;
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  if (existsSync(stage)) renameSync(stage, backup);
  renameSync(temporary, stage);
  return backup;
}

export function refresh(root = process.cwd()) {
  const source = resolve(root);
  const errors = validatePackaging(source);
  if (errors.length > 0) fail(`Source packaging is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);

  const stage = managedStage(source);
  const marketplaces = listMarketplaces();
  const development = requireNoForeignDevelopmentMarketplace(marketplaces, stage);
  const temporary = buildStaging(source, stage);
  const backup = replaceStaging(stage, temporary);
  try {
    if (development) {
      runCodex(["plugin", "remove", `plus-ultra@${developmentMarketplace}`], { allowFailure: true });
      runCodex(["plugin", "marketplace", "remove", developmentMarketplace]);
    }
    runCodex(["plugin", "remove", `plus-ultra@${stableMarketplace}`], { allowFailure: true });
    runCodex(["plugin", "marketplace", "add", stage]);
    runCodex(["plugin", "add", `plus-ultra@${developmentMarketplace}`]);
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    if (existsSync(backup)) renameSync(backup, stage);
    throw error;
  }
  return stage;
}

export function restore(root = process.cwd()) {
  const source = resolve(root);
  const stage = managedStage(source);
  const marketplaces = listMarketplaces();
  const development = requireNoForeignDevelopmentMarketplace(marketplaces, stage);

  if (development) {
    runCodex(["plugin", "remove", `plus-ultra@${developmentMarketplace}`], { allowFailure: true });
    runCodex(["plugin", "marketplace", "remove", developmentMarketplace]);
  }
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });

  const stable = marketplaces.find((entry) => entry?.name === stableMarketplace);
  if (stable) {
    runCodex(["plugin", "marketplace", "upgrade", stableMarketplace]);
  } else {
    runCodex(["plugin", "marketplace", "add", stableSource, "--ref", "main"]);
  }
  runCodex(["plugin", "add", `plus-ultra@${stableMarketplace}`]);
}

function usage() {
  process.stderr.write("Usage: node scripts/codex-local.mjs <refresh|restore>\n");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  try {
    const action = process.argv[2];
    if (action === "refresh") {
      const stage = refresh();
      process.stdout.write(`Installed local Plus Ultra from ${stage}. Open a new Codex thread to load it.\n`);
    } else if (action === "restore") {
      restore();
      process.stdout.write("Restored stable Plus Ultra. Open a new Codex thread to load it.\n");
    } else {
      usage();
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
