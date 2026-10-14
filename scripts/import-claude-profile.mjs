#!/usr/bin/env node
// Import skills, user plugins, and MCP definitions without copying account data.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const options = {
  sourceDir: path.join(os.homedir(), ".claude"),
  sourceConfig: undefined,
  targetDir: path.join(os.homedir(), ".claude-gpt"),
  dryRun: false,
};
const flags = new Map([
  ["--source-dir", "sourceDir"],
  ["--source-config", "sourceConfig"],
  ["--target-dir", "targetDir"],
]);
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === "--dry-run") {
    options.dryRun = true;
  } else if (flags.has(flag) && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    options[flags.get(flag)] = path.resolve(process.argv[++index]);
  } else {
    throw new Error(`Unknown option or missing value: ${flag}`);
  }
}
const sourceDir = path.resolve(options.sourceDir);
const targetDir = path.resolve(options.targetDir);
const sourceConfig = options.sourceConfig ?? (
  sourceDir === path.join(os.homedir(), ".claude")
    ? path.join(os.homedir(), ".claude.json")
    : path.join(sourceDir, ".claude.json")
);
if (sourceDir === targetDir || targetDir.startsWith(sourceDir + path.sep) || sourceDir.startsWith(targetDir + path.sep)) {
  throw new Error("Source and target profiles must be separate directories");
}
if (!fs.existsSync(sourceDir)) throw new Error(`Source profile does not exist: ${sourceDir}`);
const snapshots = new Map();
const readJson = (file) => {
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (file.startsWith(targetDir + path.sep) && !snapshots.has(file)) snapshots.set(file, text);
  return text === null ? {} : JSON.parse(text);
};
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const copies = new Map();
const updates = new Map();
const summary = { skills: [], commands: [], plugins: [], userMcpServers: [], projectMcpProfiles: [] };

function planCopy(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Missing import source: ${source}`);
  if (!fs.existsSync(target)) copies.set(target, source);
}
function relocate(value) {
  if (typeof value === "string" && value.startsWith(sourceDir + path.sep)) {
    return path.join(targetDir, path.relative(sourceDir, value));
  }
  if (Array.isArray(value)) return value.map(relocate);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, relocate(child)]));
  return value;
}
function planJson(relative, value) {
  const file = path.join(targetDir, relative);
  const text = JSON.stringify(value, null, 2) + "\n";
  if (!fs.existsSync(file) || JSON.stringify(readJson(file)) !== JSON.stringify(value)) {
    updates.set(file, text);
  }
}

for (const directory of ["skills", "commands"]) {
  const source = path.join(sourceDir, directory);
  if (!fs.existsSync(source)) continue;
  for (const name of fs.readdirSync(source)) {
    if (name.startsWith(".")) continue;
    const target = path.join(targetDir, directory, name);
    if (fs.existsSync(target)) continue;
    planCopy(path.join(source, name), target);
    summary[directory].push(name);
  }
}

const sourceInstalled = readJson(path.join(sourceDir, "plugins/installed_plugins.json"));
const targetInstalled = readJson(path.join(targetDir, "plugins/installed_plugins.json"));
const plugins = { ...(targetInstalled.plugins ?? {}) };
const importedMarkets = new Set();
const userPluginIds = new Set();
for (const [id, installations] of Object.entries(sourceInstalled.plugins ?? {})) {
  const userInstallations = installations.filter((entry) => entry.scope === "user");
  if (!userInstallations.length) continue;
  userPluginIds.add(id);
  if (plugins[id]?.length) continue;
  plugins[id] = userInstallations.map((entry) => {
    if (typeof entry.installPath !== "string") throw new Error(`Plugin has no install path: ${id}`);
    const target = relocate(entry.installPath);
    if (target !== entry.installPath) planCopy(entry.installPath, target);
    return { ...entry, installPath: target };
  });
  importedMarkets.add(id.slice(id.lastIndexOf("@") + 1));
  summary.plugins.push(id);
}
if (summary.plugins.length) {
  planJson("plugins/installed_plugins.json", { ...targetInstalled, version: targetInstalled.version ?? sourceInstalled.version ?? 2, plugins });
}

const sourceMarkets = readJson(path.join(sourceDir, "plugins/known_marketplaces.json"));
const markets = readJson(path.join(targetDir, "plugins/known_marketplaces.json"));
for (const name of importedMarkets) {
  if (markets[name] || !sourceMarkets[name]) continue;
  const entry = sourceMarkets[name];
  const target = relocate(entry.installLocation);
  if (typeof entry.installLocation === "string" && target !== entry.installLocation) {
    planCopy(entry.installLocation, target);
  }
  markets[name] = relocate(entry);
}
if (importedMarkets.size) planJson("plugins/known_marketplaces.json", markets);

const sourceSettings = readJson(path.join(sourceDir, "settings.json"));
const targetSettings = readJson(path.join(targetDir, "settings.json"));
const enabled = Object.fromEntries(Object.entries(sourceSettings.enabledPlugins ?? {}).filter(([id]) => userPluginIds.has(id)));
if (Object.keys(enabled).length) {
  targetSettings.enabledPlugins = { ...enabled, ...(targetSettings.enabledPlugins ?? {}) };
}
const extraMarkets = Object.fromEntries(Object.entries(sourceSettings.extraKnownMarketplaces ?? {}).filter(([name]) => importedMarkets.has(name)));
if (Object.keys(extraMarkets).length) {
  targetSettings.extraKnownMarketplaces = { ...relocate(extraMarkets), ...(targetSettings.extraKnownMarketplaces ?? {}) };
}
if (Object.keys(enabled).length || Object.keys(extraMarkets).length) planJson("settings.json", targetSettings);

const sourceGlobal = readJson(sourceConfig);
const targetGlobal = readJson(path.join(targetDir, ".claude.json"));
for (const name of Object.keys(sourceGlobal.mcpServers ?? {})) {
  if (!Object.hasOwn(targetGlobal.mcpServers ?? {}, name)) summary.userMcpServers.push(name);
}
if (Object.keys(sourceGlobal.mcpServers ?? {}).length) {
  targetGlobal.mcpServers = { ...sourceGlobal.mcpServers, ...(targetGlobal.mcpServers ?? {}) };
}
const projectKeys = ["disabledMcpServers", "disabledMcpjsonServers", "enabledMcpjsonServers", "enableAllProjectMcpServers"];
for (const [project, source] of Object.entries(sourceGlobal.projects ?? {})) {
  if (!isObject(source)) continue;
  if (!Object.keys(source.mcpServers ?? {}).length && !projectKeys.some((key) => key in source)) continue;
  const existing = targetGlobal.projects?.[project] ?? {};
  const target = { ...existing };
  if (Object.keys(source.mcpServers ?? {}).length) {
    target.mcpServers = { ...source.mcpServers, ...(target.mcpServers ?? {}) };
  }
  for (const key of projectKeys) {
    if (!(key in target) && key in source) target[key] = source[key];
  }
  if (JSON.stringify(target) !== JSON.stringify(existing)) {
    targetGlobal.projects ??= {};
    targetGlobal.projects[project] = target;
    summary.projectMcpProfiles.push(project);
  }
}
if (summary.userMcpServers.length || summary.projectMcpProfiles.length) planJson(".claude.json", targetGlobal);

const backupDir = path.join(targetDir, "backups", `profile-import-${Date.now()}`);
if (!options.dryRun && (copies.size || updates.size)) {
  for (const target of updates.keys()) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (current !== snapshots.get(target)) {
      throw new Error(`Destination changed during import; close its Claude sessions and retry: ${target}`);
    }
  }
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  for (const [target, text] of updates) {
    if (fs.existsSync(target)) {
      const backup = path.join(backupDir, path.relative(targetDir, target));
      fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
      fs.copyFileSync(target, backup);
      fs.chmodSync(backup, 0o600);
    }
  }
  for (const [target, source] of copies) {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const staging = fs.mkdtempSync(path.join(path.dirname(target), ".profile-import-"));
    try {
      const entry = path.join(staging, "entry");
      fs.cpSync(source, entry, { recursive: true, dereference: true, preserveTimestamps: true });
      fs.renameSync(entry, target);
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
  for (const [target, text] of updates) {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.import-${process.pid}.tmp`;
    fs.writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
  }
  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({ copiedPaths: [...copies.keys()], updatedFiles: [...updates.keys()] }, null, 2) + "\n", { mode: 0o600 });
}
console.log(JSON.stringify({ dryRun: options.dryRun, ...summary, copiedPaths: copies.size, updatedFiles: updates.size, ...(!options.dryRun && (copies.size || updates.size) ? { backupDir } : {}) }, null, 2));
