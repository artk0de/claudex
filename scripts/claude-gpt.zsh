# Source this file from ~/.zshrc to define claude-gpt.
# The subshell keeps runtime and provider variables local to each invocation.
claude-gpt() (
    emulate -L zsh
    unsetopt BG_NICE

    local node_version=24.15.0
    export ASDF_NODEJS_VERSION="$node_version"
    local node_dir
    if ! node_dir=$(command asdf where nodejs "$node_version" 2>/dev/null) || [[ ! -x "$node_dir/bin/node" ]]; then
        print -u2 -- "claude-gpt: Node.js $node_version is not installed in asdf"
        return 1
    fi
    export PATH="$node_dir/bin:$PATH"
    if [[ ! -x "$node_dir/bin/claudex" ]]; then
        print -u2 -- "claude-gpt: Claudex is not installed under Node.js $node_version"
        return 1
    fi

    local config_dir="$HOME/.claude-gpt"
    local proxy_port="${CLAUDE_GPT_PORT:-4032}"
    local proxy_url="http://127.0.0.1:$proxy_port"
    local proxy_log="$config_dir/claudex-$proxy_port.log"
    local compact_window="${CLAUDE_GPT_AUTO_COMPACT_WINDOW:-500000}"

    mkdir -p "$config_dir" || return 1
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
    const keepMcp = new Set(["filesystem", "git-global", "tea-rags", "ripgrep", "http-client", "mermaid", "markdownlint"]);
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
' "$config_dir" "$proxy_url" "$compact_window" || return 1

    if ! curl -fsS "$proxy_url/health" >/dev/null 2>&1; then
        nohup env -u CODEX_MODEL -u CODEX_REASONING PROXY_PORT="$proxy_port" \
            claudex --reuse-codex --port "$proxy_port" \
            >"$proxy_log" 2>&1 </dev/null &

        local ready=0 attempt
        for attempt in {1..30}; do
            if curl -fsS "$proxy_url/health" >/dev/null 2>&1; then
                ready=1
                break
            fi
            sleep 1
        done

        if (( ! ready )); then
            print -u2 -- "claude-gpt: Claudex proxy did not become ready; see $proxy_log"
            return 1
        fi
    fi

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
        claude "$@"
)
