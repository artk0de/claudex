function claude-gpt --description "Claude Code via ChatGPT/Codex through Claudex"
    # Use the installation's Node version in every working directory.
    set -l node_version 24.15.0
    set -lx ASDF_NODEJS_VERSION $node_version
    set -l node_dir (command asdf where nodejs $node_version 2>/dev/null)
    if test $status -ne 0; or not test -x "$node_dir/bin/node"
        echo "claude-gpt: Node.js $node_version is not installed in asdf" >&2
        return 1
    end
    set -lx PATH "$node_dir/bin" $PATH
    if not test -x "$node_dir/bin/claudex"
        echo "claude-gpt: Claudex is not installed under Node.js $node_version" >&2
        return 1
    end

    set -l config_dir "$HOME/.claude-gpt"
    set -l proxy_port 4032
    if set -q CLAUDE_GPT_PORT
        set proxy_port $CLAUDE_GPT_PORT
    end
    set -l proxy_url "http://127.0.0.1:$proxy_port"
    set -l proxy_log "$config_dir/claudex-$proxy_port.log"
    set -l compact_window 500000
    if set -q CLAUDE_GPT_AUTO_COMPACT_WINDOW
        set compact_window $CLAUDE_GPT_AUTO_COMPACT_WINDOW
    end

    mkdir -p "$config_dir"
    # Background workers reload profile settings instead of retaining all env vars.
    node -e '
const fs = require("node:fs");
const path = require("node:path");
const [directory, baseUrl, compactWindow] = process.argv.slice(1);
function update(name, change) {
    const file = path.join(directory, name);
    const original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    const data = original === null ? {} : JSON.parse(original);
    change(data);
    const text = JSON.stringify(data, null, 2) + "\n";
    if (text !== original) {
        const temporary = file + ".launcher-" + process.pid + ".tmp";
        fs.writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
        fs.renameSync(temporary, file);
    }
}
update(".claude.json", (data) => {
    data.hasCompletedOnboarding = true;
    const keepMcp = new Set(["tea-rags"]);
    data.mcpServers = Object.fromEntries(Object.entries(data.mcpServers || {}).filter(([name]) => keepMcp.has(name)));
});
update("settings.json", (data) => {
    data.env = { ...data.env, ANTHROPIC_BASE_URL: baseUrl,
        ANTHROPIC_API_KEY: "sk-ant-placeholder",
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: compactWindow,
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: "872000" };
    const keepPlugins = new Set(["tea-rags@tea-rags", "dinopowers@tea-rags", "superpowers@claude-plugins-official"]);
    data.enabledPlugins = Object.fromEntries(Object.keys(data.enabledPlugins || {}).map((id) => [id, keepPlugins.has(id)]));
});
' "$config_dir" "$proxy_url" "$compact_window"
    if test $status -ne 0
        return 1
    end

    if not curl -fsS "$proxy_url/health" >/dev/null 2>&1
        nohup env -u CODEX_MODEL -u CODEX_REASONING PROXY_PORT=$proxy_port claudex --reuse-codex --port $proxy_port \
            >"$proxy_log" 2>&1 </dev/null &

        set -l ready 0
        for attempt in (seq 1 30)
            if curl -fsS "$proxy_url/health" >/dev/null 2>&1
                set ready 1
                break
            end
            sleep 1
        end

        if test $ready -ne 1
            echo "claude-gpt: Claudex proxy did not become ready; see $proxy_log" >&2
            return 1
        end
    end

    # Claude Code resolves these model slots before sending them to Claudex.
    env -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_MODEL \
        -u CLAUDE_CODE_AUTO_COMPACT_WINDOW -u CLAUDE_CODE_DISABLE_1M_CONTEXT \
        -u CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT \
        CLAUDE_CONFIG_DIR="$config_dir" \
        ANTHROPIC_BASE_URL="$proxy_url" \
        ANTHROPIC_API_KEY="sk-ant-placeholder" \
        CLAUDE_CODE_AUTO_COMPACT_WINDOW="$compact_window" \
        ANTHROPIC_DEFAULT_MODEL="opus" \
        CLAUDE_CODE_MAX_CONTEXT_TOKENS="872000" \
        ANTHROPIC_DEFAULT_FABLE_MODEL="gpt-6-astra" \
        ANTHROPIC_DEFAULT_FABLE_MODEL_NAME="Fable · GPT-6-Astra · 872k" \
        ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION="GPT-6-Astra via Claudex; maximum context: 872000 tokens" \
        ANTHROPIC_DEFAULT_OPUS_MODEL="gpt-6.1-sol" \
        ANTHROPIC_DEFAULT_OPUS_MODEL_NAME="Opus · GPT-6.1-Sol · 872k" \
        ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION="GPT-6.1-Sol via Claudex; maximum context: 872000 tokens" \
        ANTHROPIC_DEFAULT_SONNET_MODEL="gpt-6-sol" \
        ANTHROPIC_DEFAULT_SONNET_MODEL_NAME="Sonnet · GPT-6-Sol · 872k" \
        ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION="GPT-6-Sol via Claudex; maximum context: 872000 tokens" \
        ANTHROPIC_DEFAULT_HAIKU_MODEL="gpt-6-luna" \
        ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME="Haiku · GPT-6-Luna · 872k" \
        ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION="GPT-6-Luna via Claudex; maximum context: 872000 tokens" \
        claude $argv
end
