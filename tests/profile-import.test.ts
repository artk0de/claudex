import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

describe("profile import", () => {
  it("should merge skills, user plugins, and MCP without overwriting profile settings", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-import-"));
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    const write = (file: string, value: unknown): void => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value));
    };
    const read = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, "utf8"));
    const run = (...args: string[]): Record<string, any> => JSON.parse(execFileSync(
      process.execPath,
      [path.join(process.cwd(), "scripts/import-claude-profile.mjs"), "--source-dir", source, "--target-dir", target, ...args],
      { encoding: "utf8" }
    ));
    try {
      write(path.join(source, "skills/new-skill/SKILL.md"), "new skill");
      write(path.join(source, "skills/existing/SKILL.md"), "source skill");
      write(path.join(target, "skills/existing/SKILL.md"), "target skill");
      write(path.join(source, "settings.json"), {
        model: "source-model",
        env: { SOURCE_TOKEN: "not copied" },
        enabledPlugins: { "demo@market": true, "project-only@market": true },
      });
      write(path.join(target, "settings.json"), {
        model: "target-model",
        enabledPlugins: { "demo@market": false },
      });
      const pluginPath = path.join(source, "plugins/cache/market/demo/1.0");
      write(path.join(pluginPath, "skills/demo/SKILL.md"), "plugin skill");
      write(path.join(source, "plugins/installed_plugins.json"), {
        version: 2,
        plugins: {
          "demo@market": [{ scope: "user", installPath: pluginPath }],
          "project-only@market": [{ scope: "project", installPath: pluginPath }],
        },
      });
      write(path.join(source, "plugins/marketplaces/market/manifest.json"), {});
      write(path.join(source, "plugins/known_marketplaces.json"), {
        market: { installLocation: path.join(source, "plugins/marketplaces/market") },
      });
      write(path.join(source, ".credentials.json"), { login: "not copied" });
      write(path.join(source, ".claude.json"), {
        account: "not copied",
        mcpServers: { existing: { command: "source" }, added: { command: "new" } },
        projects: { "/example": { mcpServers: { projectServer: { command: "project" } }, trust: "not copied" } },
      });
      write(path.join(target, ".claude.json"), {
        hasCompletedOnboarding: true,
        mcpServers: { existing: { command: "target" } },
      });

      const preview = run("--dry-run");
      assert.deepEqual(preview.skills, ["new-skill"]);
      assert.equal(fs.existsSync(path.join(target, "skills/new-skill")), false);
      assert.equal(fs.existsSync(path.join(target, "backups")), false);

      const result = run();
      const settings = read(path.join(target, "settings.json"));
      assert.equal(settings.model, "target-model");
      assert.equal(settings.env, undefined);
      assert.equal(settings.enabledPlugins["demo@market"], false);
      assert.equal(settings.enabledPlugins["project-only@market"], undefined);
      assert.equal(fs.readFileSync(path.join(target, "skills/existing/SKILL.md"), "utf8"), JSON.stringify("target skill"));
      assert.equal(fs.existsSync(path.join(target, "skills/new-skill/SKILL.md")), true);
      const global = read(path.join(target, ".claude.json"));
      assert.equal(global.hasCompletedOnboarding, true);
      assert.equal(global.account, undefined);
      assert.equal(global.mcpServers.existing.command, "target");
      assert.equal(global.mcpServers.added.command, "new");
      assert.equal(global.projects["/example"].mcpServers.projectServer.command, "project");
      assert.equal(global.projects["/example"].trust, undefined);
      assert.equal(fs.existsSync(path.join(target, ".credentials.json")), false);
      const installed = read(path.join(target, "plugins/installed_plugins.json"));
      assert.equal(installed.plugins["project-only@market"], undefined);
      assert.equal(installed.plugins["demo@market"][0].installPath, path.join(target, "plugins/cache/market/demo/1.0"));
      assert.equal(fs.existsSync(path.join(target, "plugins/cache/market/demo/1.0/skills/demo/SKILL.md")), true);
      assert.ok(fs.existsSync(path.join(result.backupDir, ".claude.json")));
      assert.equal(fs.statSync(path.join(target, ".claude.json")).mode & 0o777, 0o600);

      const repeated = run();
      assert.equal(repeated.copiedPaths, 0);
      assert.equal(repeated.updatedFiles, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
