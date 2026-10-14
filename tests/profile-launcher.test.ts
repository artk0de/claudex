import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

describe("profile launcher", () => {
  for (const shell of ["fish", "zsh"]) {
    it(`should persist background worker configuration in the ${shell} profile`, () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudex-launcher-"));
      const launcher = fs.readFileSync(path.join(process.cwd(), `scripts/claude-gpt.${shell}`), "utf8");
      const script = launcher.match(/node -e '([\s\S]*?)' "\$config_dir" "\$proxy_url"/)?.[1];
      assert.ok(script);
      const settingsFile = path.join(directory, "settings.json");
      const configFile = path.join(directory, ".claude.json");
      const run = (url: string): void => {
        execFileSync(process.execPath, ["-e", script, directory, url], { stdio: "pipe" });
      };
      try {
        fs.writeFileSync(settingsFile, JSON.stringify({
          enabledPlugins: { "demo@market": true },
          model: "sonnet",
          env: { CUSTOM_SETTING: "keep" },
        }));
        fs.writeFileSync(configFile, JSON.stringify({ mcpServers: { demo: { command: "demo" } } }));
        run("http://127.0.0.1:4032");
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
        assert.deepEqual(settings.env, {
          CUSTOM_SETTING: "keep",
          ANTHROPIC_BASE_URL: "http://127.0.0.1:4032",
          ANTHROPIC_API_KEY: "sk-ant-placeholder",
          CLAUDE_CODE_MAX_CONTEXT_TOKENS: "872000",
        });
        assert.equal(settings.enabledPlugins["demo@market"], true);
        assert.equal(settings.model, "sonnet");
        const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
        assert.equal(config.hasCompletedOnboarding, true);
        assert.equal(config.mcpServers.demo.command, "demo");
        assert.equal(fs.statSync(settingsFile).mode & 0o777, 0o600);
        const modified = fs.statSync(settingsFile).mtimeMs;
        run("http://127.0.0.1:4032");
        assert.equal(fs.statSync(settingsFile).mtimeMs, modified);
        run("http://127.0.0.1:4050");
        assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).env.ANTHROPIC_BASE_URL, "http://127.0.0.1:4050");
        fs.writeFileSync(settingsFile, "invalid json");
        assert.throws(() => run("http://127.0.0.1:4032"));
        assert.equal(fs.readFileSync(settingsFile, "utf8"), "invalid json");
        fs.rmSync(settingsFile);
        fs.rmSync(configFile);
        run("http://127.0.0.1:4032");
        assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, "872000");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
