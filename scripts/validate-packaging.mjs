import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";

const manifestPaths = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
];

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function errorPath(path, message) {
  return `${path}: ${message}`;
}

function readJson(root, path, errors) {
  const target = resolve(root, path);
  if (!existsSync(target)) {
    errors.push(errorPath(path, "missing required file"));
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(target, "utf8"));
  } catch {
    errors.push(errorPath(path, "invalid JSON"));
    return undefined;
  }
}

function validatePath(root, rootRealpath, source, label, errors) {
  if (typeof source !== "string" || source.length === 0) {
    errors.push(`${label} must be a non-empty string`);
    return;
  }
  if (isAbsolute(source)) {
    errors.push(`${label} must be relative`);
    return;
  }

  const target = resolve(root, source);
  if (relative(root, target).startsWith("..")) {
    errors.push(`${label} must not escape the plugin root`);
    return;
  }
  if (!existsSync(target)) {
    errors.push(`${label} must exist`);
    return;
  }

  const targetRealpath = realpathSync(target);
  if (relative(rootRealpath, targetRealpath).startsWith("..")) {
    errors.push(`${label} must not escape the plugin root`);
  }
}

function validateManifest(root, rootRealpath, path, manifest, errors) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
  if (manifest.name !== "plus-ultra") {
    errors.push(errorPath(path, 'name must be "plus-ultra"'));
  }
  if (typeof manifest.version !== "string" || !semverPattern.test(manifest.version)) {
    errors.push(errorPath(path, "version must be valid SemVer"));
  }
  if (typeof manifest.version === "string" && /\+codex\.local-/.test(manifest.version)) {
    errors.push(errorPath(path, "version must not use +codex.local- in a versioned manifest"));
  }

  if (path === ".claude-plugin/plugin.json") {
    validatePath(root, rootRealpath, manifest.hooks, `${path} hooks`, errors);
    if (!Array.isArray(manifest.dependencies) || !manifest.dependencies.includes("superpowers")) {
      errors.push(errorPath(path, 'dependencies must include "superpowers"'));
    }
  }
  if (path === ".codex-plugin/plugin.json") {
    validatePath(root, rootRealpath, manifest.skills, `${path} skills`, errors);
    validatePath(root, rootRealpath, manifest.hooks, `${path} hooks`, errors);
  }
  if (path === ".cursor-plugin/plugin.json") {
    validatePath(root, rootRealpath, manifest.skills, `${path} skills`, errors);
  }
}

function validateMarketplace(root, rootRealpath, path, marketplace, errors) {
  if (!marketplace || typeof marketplace !== "object" || Array.isArray(marketplace)) return;
  if (path === ".claude-plugin/marketplace.json" && marketplace.name !== "plus-ultra") {
    errors.push(errorPath(path, 'name must be "plus-ultra"'));
  }
  if (
    path === ".agents/plugins/marketplace.json" &&
    !["plus-ultra", "plus-ultra-dev"].includes(marketplace.name)
  ) {
    errors.push(errorPath(path, 'name must be "plus-ultra" or "plus-ultra-dev"'));
  }
  if (!Array.isArray(marketplace.plugins)) {
    errors.push(errorPath(path, "plugins must be an array"));
    return;
  }
  const plugin = marketplace.plugins.find((entry) => entry?.name === "plus-ultra");
  if (!plugin) {
    errors.push(errorPath(path, 'plugins must include "plus-ultra"'));
    return;
  }
  const source = typeof plugin.source === "string" ? plugin.source : plugin.source?.url;
  validatePath(root, rootRealpath, source, `${path} plus-ultra source`, errors);
}

function validateVersionCarriers(root, version, errors) {
  const versionFile = resolve(root, "version.txt");
  if (existsSync(versionFile) && readFileSync(versionFile, "utf8").trim() !== version) {
    errors.push("version.txt must match plugin manifests");
  }

  const releaseManifestPath = resolve(root, ".release-please-manifest.json");
  const releaseManifest = existsSync(releaseManifestPath)
    ? readJson(root, ".release-please-manifest.json", errors)
    : undefined;
  if (releaseManifest && releaseManifest["."] !== version) {
    errors.push('.release-please-manifest.json "." must match plugin manifests');
  }
}

export function validatePackaging(root) {
  const errors = [];
  const projectRoot = resolve(root);
  if (!existsSync(projectRoot)) return [`plugin root does not exist: ${projectRoot}`];
  const rootRealpath = realpathSync(projectRoot);
  const manifests = new Map();

  for (const path of manifestPaths) {
    manifests.set(path, readJson(projectRoot, path, errors));
  }
  const marketplaces = new Map([
    [
      ".claude-plugin/marketplace.json",
      readJson(projectRoot, ".claude-plugin/marketplace.json", errors),
    ],
    [
      ".agents/plugins/marketplace.json",
      readJson(projectRoot, ".agents/plugins/marketplace.json", errors),
    ],
  ]);

  for (const [path, manifest] of manifests) {
    validateManifest(projectRoot, rootRealpath, path, manifest, errors);
  }
  for (const [path, marketplace] of marketplaces) {
    validateMarketplace(projectRoot, rootRealpath, path, marketplace, errors);
  }

  const versions = manifestPaths
    .map((path) => manifests.get(path)?.version)
    .filter((version) => typeof version === "string");
  if (new Set(versions).size > 1) errors.push("plugin manifest versions must match");
  if (versions.length === manifestPaths.length && new Set(versions).size === 1) {
    validateVersionCarriers(projectRoot, versions[0], errors);
  }

  return [...new Set(errors)].sort();
}

export function runValidation(root) {
  const errors = validatePackaging(root);
  if (errors.length === 0) {
    process.stdout.write("Packaging validation passed.\n");
    return 0;
  }
  process.stderr.write(`Packaging validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  return 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  process.exitCode = runValidation(process.argv[2] ?? process.cwd());
}
