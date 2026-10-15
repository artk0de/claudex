<div align="center">

# Claudex

**Bridge Claude Code to ChatGPT Codex and use your ChatGPT subscription as the backend for Claude Code.**

[![npm version](https://img.shields.io/npm/v/@caixiaoshun/claudex.svg)](https://www.npmjs.com/package/@caixiaoshun/claudex)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

</div>

## If you are an agent: use this prompt for the full setup

When the user asks you to set up Claudex, use the following prompt as the setup
checklist and follow the detailed instructions below:

> Set up https://github.com/artk0de/claudex following its README. Build and install this fork, create a persistent `claude-gpt` command for my shell with an isolated profile, and import my existing Claude Code skills, plugins, and MCP configurations. Configure Fable/Opus/Sonnet/Haiku aliases through environment variables, with accurate context limits and model picker labels. Pin the launcher's Node runtime so it works from any directory. Verify actual responses in both a regular session and a background agent, model selection, and imported MCP connections. Preserve my existing profile.

Use the [installation instructions](#installation),
[profile launchers and model aliases](#separate-claude-code-profile-with-model-aliases),
and [profile import instructions](#import-skills-and-mcp-from-an-existing-profile)
to complete the setup. The supplied launchers support Fish and zsh with asdf;
adapt them to the user's environment when needed. Codex login and MCP OAuth
authentication may require the user's participation.

---

## What Is This?

**Claudex** is a local proxy that lets you point [Claude Code](https://docs.anthropic.com/en/docs/claude-code) at the ChatGPT Codex backend instead of Anthropic's API.

It accepts Claude Code's Anthropic-style requests, converts them into the Codex Responses API format, forwards them to `chatgpt.com/backend-api/codex/responses`, and converts the responses back into Anthropic-compatible output.

This is useful if:

- you already have ChatGPT Plus/Pro with Codex access
- you want Claude Code's CLI / IDE workflow
- you do not want to pay separately for Anthropic API usage just to use Claude Code

---

## Installation

Build and install this fork to get its compatibility fixes and profile launcher:

```bash
asdf install nodejs 24.15.0  # if not already installed
export ASDF_NODEJS_VERSION=24.15.0
export PATH="$(asdf where nodejs 24.15.0)/bin:$PATH"
git clone https://github.com/artk0de/claudex.git
cd claudex
npm ci
npm run build
npm pack
npm install -g ./caixiaoshun-claudex-*.tgz
```

The `@caixiaoshun/claudex` npm release belongs to the upstream project and does
not include this fork's changes. With a Node version manager, install the package
under the Node version your shell uses to run `claudex`.

---

## Recent Updates

- Claude Code compatibility now covers modern client behavior such as `system -> developer`, `web_search_20250305`, `disable_parallel_tool_use`, `thinking` / `thinking_delta`, streamed `function_call_arguments`, and structured `tool_result` payloads with images.
- `POST /v1/messages/count_tokens` is implemented so Claude Code can request token estimates without calling Anthropic.
- `claude --resume` and `claude --continue` are bridged locally by reconstructing prior turns from `~/.claude/projects` when the Codex backend cannot continue natively.
- Session recovery first checks shell history, then falls back to the active `claude` process command line if shell history has not been written yet.
- Live Windows E2E validation now covers print/json/stream mode, `CLAUDE.md`, skills, slash commands, plugins, MCP, hooks, subagents, Todo/file workflows, and real `resume` / `continue` flows with Claude Code `2.1.76`.

For the detailed audit, see [`CLAUDE_CODE_COMPATIBILITY.md`](CLAUDE_CODE_COMPATIBILITY.md).

---

## Quick Start

### 1. Bypass Claude Code onboarding once

Claude Code requires onboarding to be marked complete. Run this once:

```bash
node --eval "
const fs = require('fs');
const path = require('path');
const file = path.join(require('os').homedir(), '.claude.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch {}
config.hasCompletedOnboarding = true;
fs.writeFileSync(file, JSON.stringify(config, null, 2));
console.log('Onboarding bypassed');
"
```

### 2. Start Claudex

```bash
claudex
```

On first run, Claudex opens the browser for ChatGPT OAuth login and then starts the proxy on port `4000` by default.

### 3. Point Claude Code at the local proxy

macOS / Linux:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4000
export ANTHROPIC_API_KEY=sk-ant-placeholder
```

Windows PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL = "http://localhost:4000"
$env:ANTHROPIC_API_KEY = "sk-ant-placeholder"
```

Windows CMD:

```cmd
set ANTHROPIC_BASE_URL=http://localhost:4000
set ANTHROPIC_API_KEY=sk-ant-placeholder
```

### 4. Use Claude Code normally

```bash
claude "Help me refactor this function"
```

All Claude Code traffic now flows through Claudex to the ChatGPT Codex backend.

---

## Separate Claude Code profile with model aliases

Install Claude Code and sign in to Codex CLI with `codex login` first. The Fish
and zsh launchers start Claudex
with `--reuse-codex`, wait for its health endpoint, and run Claude Code with
`CLAUDE_CONFIG_DIR=$HOME/.claude-gpt`. Its settings, onboarding configuration,
and session files are kept in that profile. Instructions from the working
project still apply.

### Fish

From the fork's checkout, install [`scripts/claude-gpt.fish`](scripts/claude-gpt.fish):

```fish
mkdir -p ~/.config/fish/functions
cp scripts/claude-gpt.fish ~/.config/fish/functions/claude-gpt.fish
source ~/.config/fish/functions/claude-gpt.fish
claude-gpt -p "hi!"
```

### zsh

From the fork's checkout, install [`scripts/claude-gpt.zsh`](scripts/claude-gpt.zsh):

```zsh
mkdir -p ~/.config/zsh
cp scripts/claude-gpt.zsh ~/.config/zsh/claude-gpt.zsh
source ~/.config/zsh/claude-gpt.zsh
claude-gpt --model sonnet -p "hi!"
```

Add this line to `~/.zshrc` to load the function in new terminals:

```zsh
source "$HOME/.config/zsh/claude-gpt.zsh"
```

The zsh function runs in a subshell, so its exported Node and provider variables
do not change your current shell. It passes arguments as `"$@"`, preserving
quoted prompts and flags. Both launchers use the same profile and model aliases;
`claude-gpt --model sonnet` and `/model sonnet` work in either shell.

### Runtime and proxy settings

Both launchers require asdf and Node.js `24.15.0`, with Claudex installed under
that version. They set an invocation-local `ASDF_NODEJS_VERSION` and prepend the
matching Node `bin` directory to `PATH`, so it uses the same runtime in every
working directory, including repositories with a different `.tool-versions`.
The override is inherited by Claude Code and its child processes; the calling
shell's environment is restored when the function returns. To upgrade the
runtime, change `node_version` in the function and install Claudex under that
Node version.

The launcher uses port `4032`. Set `CLAUDE_GPT_PORT` before launching to use
another port. Its proxy log is `~/.claude-gpt/claudex-<port>.log`.

### Background agents

Use the same launcher for the background agent view and background sessions:

```bash
claude-gpt agents
claude-gpt --bg --model sonnet "Explain this repository"
```

Passing the proxy URL and API key only through the launcher's environment is
not sufficient for all background workers. The launchers also merge these
values into `~/.claude-gpt/settings.json`, retaining existing settings:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:4032",
    "ANTHROPIC_API_KEY": "sk-ant-placeholder",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "500000",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "872000"
  }
}
```

The key above is a placeholder for the local proxy; Claudex uses the Codex
session for upstream authentication. Keep these values in the isolated
profile so workers can load them even when the background daemon does not
retain the original shell environment. The launcher updates the URL when
`CLAUDE_GPT_PORT` changes.

After updating an older Fish launcher, reload it:

```fish
source ~/.config/fish/functions/claude-gpt.fish
claude-gpt agents
```

For zsh, source `~/.config/zsh/claude-gpt.zsh` instead. If an existing background
session still shows `Invalid API key`, restart that session while preserving
its conversation with `claude-gpt respawn <session-id>`. Use
`claude-gpt logs <session-id>` to inspect its response and check the proxy log for the matching
request.

### Set aliases with environment variables

The aliases are Claude Code model slots. Set their target IDs in the launcher's
`env` block; Claude Code resolves them before sending requests to Claudex.

| Slot | Environment variable | Codex model | Default window | Maximum window |
|------|----------------------|-------------|----------------|----------------|
| Fable | `ANTHROPIC_DEFAULT_FABLE_MODEL` | `gpt-6-astra` | 272,000 | 872,000 |
| Opus | `ANTHROPIC_DEFAULT_OPUS_MODEL` | `gpt-6.1-sol` | 500,000 | 872,000 |
| Sonnet | `ANTHROPIC_DEFAULT_SONNET_MODEL` | `gpt-6-sol` | 272,000 | 872,000 |
| Haiku | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `gpt-6-luna` | 272,000 | 872,000 |

These windows were reported by the live Codex model catalog on October 14, 2026.
The launcher sets `CLAUDE_CODE_MAX_CONTEXT_TOKENS=872000` because all four targets
advertise that maximum. This declares the window to Claude Code and keeps
auto-compaction enabled. It also sets the companion `_NAME` and `_DESCRIPTION`
variables so `/model` shows the slot, actual GPT model, and 872k window.

`CLAUDE_CODE_MAX_CONTEXT_TOKENS` applies to the whole process, including models
selected later with `/model`. If you change a target model, check its catalog
limits and update the window and picker descriptions. When your chosen models
have different maximum windows, use their smallest maximum as the shared limit.
Do not add `[1m]` to these aliases: that tells Claude Code to assume a 1M window.

The GPT launcher intentionally auto-compacts at `272000` tokens to keep large
MCP and skill prompts from reaching the upstream request buffer limit. Override
that threshold with `CLAUDE_GPT_AUTO_COMPACT_WINDOW=200000` (or another value
supported by Claude Code). The launcher passes it as
`CLAUDE_CODE_AUTO_COMPACT_WINDOW` and stores it in the isolated profile for
background agents.

Inspect the current metadata with:

```bash
curl -fsS http://127.0.0.1:4032/claudex/models
```

Each discovered model includes `contextWindow` and `maxContextWindow` when Codex
reports them. For the client-side window setting, see the
[Claude Code model configuration](https://code.claude.com/docs/en/model-config#correct-the-window-for-a-gateway-or-custom-model-id).

### GPT profile MCP and plugin load

The GPT profile keeps the `tea-rags` MCP server and its `tea-rags`, `dinopowers`,
and `superpowers` plugins enabled. Other imported global MCP servers and
optional plugins are disabled in this profile to reduce schema and instruction
overhead. The regular `~/.claude` profile is not changed. The launchers enforce
this allow-list each time they start; restore a disabled integration by editing
the allow-list in both launcher scripts.

### Select or switch models

```fish
claude-gpt --model sonnet
claude-gpt --model fable
claude-gpt --model haiku -p "Reply exactly: OK"
```

Inside an interactive session, open `/model` to choose a row, or switch directly:

```text
/model sonnet
/model opus
/model fable
/model haiku
```

The launcher passes arguments through to `claude`. It sets
`ANTHROPIC_DEFAULT_MODEL=opus` for a fresh profile, rather than forcing
`ANTHROPIC_MODEL` on every launch, so a selection saved with `/model` can become
the profile's next-session default. `--model` overrides that default.

To inspect the model and context window Claude Code actually used:

```fish
claude-gpt --model sonnet -p "Reply exactly: OK" --output-format json
```

Check `modelUsage`: the entry should be `gpt-6-sol`, with `contextWindow: 872000`.
The `[claude-code:unrecognized_model]` stderr diagnostic may still appear for
GPT IDs. It does not mean the request failed; the launcher declares the window
explicitly instead of letting Claude Code assume 200k.

### Import skills and MCP from an existing profile

Check the existing launcher's `CLAUDE_CONFIG_DIR` first. A launcher named
`claude-max` that unsets this variable uses the standard profile `~/.claude`,
with user and project-local MCP definitions in `~/.claude.json`. The launcher
name does not imply a directory named `~/.claude-max`.

Close sessions using the destination profile before importing, so they do not
write their settings at the same time. From this fork's checkout, preview the
import with [`scripts/import-claude-profile.mjs`](scripts/import-claude-profile.mjs):

```bash
node scripts/import-claude-profile.mjs \
  --source-dir "$HOME/.claude" \
  --source-config "$HOME/.claude.json" \
  --target-dir "$HOME/.claude-gpt" \
  --dry-run
```

Then run the same command without `--dry-run` to apply it:

```bash
node scripts/import-claude-profile.mjs \
  --source-dir "$HOME/.claude" \
  --source-config "$HOME/.claude.json" \
  --target-dir "$HOME/.claude-gpt"
```

These commands work in Fish and zsh. For a custom source profile, use its
directory as `--source-dir` and its `.claude.json` file as `--source-config`.

The importer copies missing user skills and commands, user-installed plugin
caches, and the marketplace registrations those plugins need. It relocates
plugin installation paths into the destination, retains their enabled or
disabled settings, and merges global and project-local MCP definitions.
Existing destination skill names, plugin installations, MCP server names, and
settings take precedence. Re-running the import adds missing entries without
overwriting existing ones.

Before changing JSON files, the importer saves their originals under
`~/.claude-gpt/backups/profile-import-<timestamp>/`. Its `manifest.json` lists
newly copied paths and changed files. The command prints names and counts,
without printing MCP environment values or credentials.

Anthropic account credentials, chat history, provider environment settings,
hooks, permissions, and model choices are not imported. MCP definitions may
include their own `env` credentials; those stay in the private destination
configuration. OAuth sessions stored separately are not copied, so a server
may require authentication again through `/mcp`. External executable paths and
service URLs in MCP definitions remain unchanged; this import assumes those
tools and services are available on the same machine.

Restart `claude-gpt`, then use `/skills` and `/mcp` to inspect the imported
configuration. To check server connections from the shell:

```bash
claude-gpt mcp list
```

Restore a changed JSON file by copying its counterpart from the reported backup
directory. The manifest identifies newly copied directories if you also need
to remove imported files.

---

## Claude Code Compatibility

Claudex is no longer just a thin `/v1/messages` translator. It now specifically adapts Claude Code behaviors that matter in real usage, including:

- `system` prompt conversion into a Codex `developer` message
- Claude-style tool schemas emitted as Codex function tools with `strict: false`
- long MCP tool name shortening and response-side restoration
- built-in Claude tool mapping such as `web_search_20250305`
- `disable_parallel_tool_use` to `parallel_tool_calls`
- `thinking` blocks and streamed `thinking_delta`
- streamed `function_call_arguments.delta` / `function_call_arguments.done`
- structured `tool_result` content with both text and images
- local `/v1/messages/count_tokens` estimation
- local `claude --resume` / `claude --continue` session reconstruction

Live validation was run against an installed Claude Code CLI on Windows. The proxy-relevant paths now cover:

- `claude -p` text, `json`, and `stream-json`
- `CLAUDE.md` and project memory loading
- slash commands and skills
- plugin-backed commands and custom agents
- MCP tools, resources, and prompts
- hooks
- subagent delegation
- Todo / file workflows
- `resume` / `continue`

See [`CLAUDE_CODE_COMPATIBILITY.md`](CLAUDE_CODE_COMPATIBILITY.md) for the feature-by-feature matrix.

---

## Credential Reuse

If you already have Codex CLI or opencode installed and logged in, you can skip the browser OAuth flow:

```bash
claudex --reuse-codex
```

Claudex looks for credentials in:

| Source | Path |
|--------|------|
| OpenAI Codex CLI | `~/.codex/auth.json` |
| opencode | `~/.opencode/session.json` |
| opencode v2 | `~/.opencode/auth/codex.json` |

To see which sources are available:

```bash
claudex --list-sources
```

---

## Windows E2E Verification

To validate a checkout against a real Claude Code session on Windows:

1. Build the project.

```powershell
npm install
npm run build
```

2. Start the proxy with debug logging.

```powershell
claudex --reuse-codex --debug
```

3. In another PowerShell window, point Claude Code at the proxy.

```powershell
$env:ANTHROPIC_BASE_URL = "http://localhost:4000"
$env:ANTHROPIC_API_KEY = "sk-ant-placeholder"
```

If Claude Code's local `WebFetch` tool fails with `unable to get local issuer certificate`, that is usually a local Node.js trust-store problem rather than a Claudex issue. For quick validation only:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
```

Prefer installing the correct root certificate for a permanent fix.

4. Exercise real Claude Code flows, for example:

- `Run "pwd" and tell me the result.`
- `Fetch https://example.com and summarize it.`
- `Delegate a small subtask to another agent and return its summary.`
- `Create and maintain a todo list while doing a multi-step task.`
- `Read a scratch file, make a small edit, and show the result.`
- `Resume the previous session and recall what I asked you to store.`

Successful validation means the session completes in Claude Code, tool output renders normally, and the proxy log stays free of upstream `Codex API error: 400` failures.

---

## Model Selection And Reasoning

### Automatic tier mapping

Claudex maps Anthropic model names to the best available Codex model from the live model list. If live discovery is unavailable, it falls back to built-in defaults.

| Claude Code sends | Claudex uses |
|-------------------|--------------|
| `claude-opus-*` | High-tier live mapping, fallback `gpt-5.4` |
| `claude-*-sonnet-*` | Mid-tier live mapping, fallback `gpt-5.4-mini` |
| `claude-*-haiku-*` | Fast-tier live mapping, fallback `gpt-5.4-nano` |

Startup logs print the actual resolved mapping, including an explicit `sonnet4.6 -> ...` example line.

### Override at startup

```bash
claudex --model gpt-5.4-mini --reasoning high
```

### Override via environment variables

```bash
CODEX_MODEL=gpt-5.4-mini CODEX_REASONING=high claudex
```

Use tier-specific overrides when each Claude model tier should use a different
Codex model. A tier override takes precedence over `CODEX_MODEL` for matching
Claude model IDs; `claudex:<model>:<reasoning>` remains the most specific
per-request override.

```bash
CODEX_FABLE_MODEL=gpt-5.4 \
CODEX_OPUS_MODEL=gpt-5.4 \
CODEX_SONNET_MODEL=gpt-5.4-mini \
CODEX_HAIKU_MODEL=gpt-5.4-nano \
claudex
```

### Override at runtime

```bash
curl -X POST http://localhost:4000/claudex/config \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5.4-mini", "reasoning": "high", "tierModels": {"opus": "gpt-5.4", "sonnet": "gpt-5.4-mini", "haiku": "gpt-5.4-nano"}}'
```

### Override from Claude Code `/model`

Claudex also supports the convention:

```text
/model claudex:gpt-5.4-mini:high
```

The reasoning suffix is optional:

```text
/model claudex:gpt-5.4
```

### Reasoning levels

| Level | Description |
|-------|-------------|
| `low` | Minimal reasoning, fastest responses |
| `medium` | Balanced reasoning |
| `high` | Maximum reasoning depth |

If Claude Code sends adaptive / enabled thinking, Claudex maps that to a Codex reasoning effort automatically. In the absence of an explicit override, the default is `medium`.

---

## Dynamic Model Discovery

On startup, Claudex fetches the live model list from `chatgpt.com/backend-api/codex/models` and caches it. The request includes a Codex `client_version` hint so discovery better matches the backend. If discovery fails, Claudex falls back to its built-in model list.

### View available models

```bash
curl http://localhost:4000/claudex/models
```

### Refresh the model list

```bash
# via API
curl -X POST http://localhost:4000/claudex/models/refresh

# via CLI
claudex --refresh-models
```

### Configure automatic refresh

```bash
CODEX_MODEL_REFRESH_INTERVAL=1800000 claudex  # 30 minutes
```

If your connection to `chatgpt.com` is flaky, you can also tune upstream fetch retries:

```bash
CODEX_API_FETCH_RETRIES=5 CODEX_API_FETCH_RETRY_DELAY_MS=1500 claudex
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/messages` | Anthropic Messages API proxy |
| `POST` | `/v1/messages/count_tokens` | Claude-compatible local token estimate |
| `GET` | `/claudex/models` | List discovered models and current tier mapping |
| `POST` | `/claudex/models/refresh` | Refresh the model list from Codex |
| `POST` | `/claudex/config` | Update runtime model / reasoning overrides |
| `GET` | `/health` | Health check |

Examples:

```bash
# health
curl http://localhost:4000/health

# list models
curl http://localhost:4000/claudex/models

# refresh models
curl -X POST http://localhost:4000/claudex/models/refresh

# estimate tokens
curl -X POST http://localhost:4000/v1/messages/count_tokens \
  -H "Content-Type: application/json" \
  -H "x-api-key: placeholder" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Count this request."}]
  }'

# update runtime config
curl -X POST http://localhost:4000/claudex/config \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5.4-mini", "reasoning": "medium"}'

# send a message
curl -X POST http://localhost:4000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: placeholder" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## CLI Flags

```text
Usage:
  claudex [options]

Options:
  -p, --port <port>              Port to listen on (default: 4000)
  --model <model>                OpenAI model to use (for example gpt-5.4-mini)
  --reasoning <low|medium|high>  Reasoning intensity level
  --reuse-codex                  Import credentials from existing Codex / opencode installs
  --list-sources                 List detected external credential sources and exit
  --refresh-models               Refresh the model list from the Codex API and exit
  --debug                        Enable debug logging
  -h, --help                     Show help
  -v, --version                  Show version
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEX_MODEL` | Force a specific Codex model | Auto-mapped from Claude Code model |
| `CODEX_REASONING` | Force a reasoning level | Auto |
| `CODEX_FABLE_MODEL` | Override the Fable tier's Codex model | Automatic tier mapping |
| `CODEX_OPUS_MODEL` | Override the Opus tier's Codex model | Automatic tier mapping |
| `CODEX_SONNET_MODEL` | Override the Sonnet tier's Codex model | Automatic tier mapping |
| `CODEX_HAIKU_MODEL` | Override the Haiku tier's Codex model | Automatic tier mapping |
| `CODEX_API_ENDPOINT` | Override Codex Responses API endpoint | `https://chatgpt.com/backend-api/codex/responses` |
| `CODEX_CLIENT_VERSION` | Override the model-discovery `client_version` hint | Auto-detected or `0.115.0` |
| `CODEX_API_FETCH_RETRIES` | Retries for upstream Codex fetch failures | `3` |
| `CODEX_API_FETCH_RETRY_DELAY_MS` | Base retry delay in ms for upstream fetch retries | `1000` |
| `CODEX_MODEL_REFRESH_INTERVAL` | Background model refresh interval in ms | `3600000` |
| `PROXY_PORT` | Default port if `--port` is not provided | `4000` |

---

## Architecture

```text
Claude Code -> POST /v1/messages
     |
     v
  Claudex Proxy
     |
     +- optional local session bridge for resume / continue
     +- convert Anthropic system -> Codex developer
     +- normalize Claude tool schemas
     +- map Claude built-ins and preserve tool transcripts
     +- always talk to Codex with stream=true and store=false
     |
     v
  ChatGPT Codex Responses API
     |
     v
  Claudex converts SSE / JSON back to Anthropic format
     |
     v
  Claude Code receives an Anthropic-compatible response
```

Key implementation details:

- **Tool schema normalization:** Claudex recursively walks nested JSON Schema nodes, strips unsupported keywords, infers missing `type` fields where needed, and emits Codex function tools with `strict: false`.
- **Message conversion:** Anthropic `system` becomes a Codex `developer` message. Tool transcripts are preserved as Codex `function_call` and `function_call_output` items.
- **Claude Code-specific adaptation:** Claudex shortens long MCP-style tool names, restores them in responses, maps `web_search_20250305`, respects `disable_parallel_tool_use`, and preserves structured `tool_result` blocks with text plus images.
- **Streaming:** Claudex always talks to Codex with `stream: true`, then either forwards SSE to Claude Code or aggregates the stream back into a normal JSON response.
- **Resume / continue:** Because Codex continuation is not natively available in the way Claude Code expects here, Claudex reconstructs prior turns from `~/.claude/projects`, matching the active prompt against shell history first and then the live `claude` process command line if needed.
- **Count tokens:** `/v1/messages/count_tokens` uses the same effective request shape, including any local resume / continue session reconstruction.
- **Authentication:** Claudex uses the same OAuth PKCE style flow as Codex CLI / opencode and refreshes tokens in a concurrency-safe way.

---

## Project Structure

```text
src/
  index.ts                  CLI entry point
  server.ts                 HTTP proxy routes and upstream fetch handling
  converter.ts              Anthropic <-> Codex format conversion
  claude-session-bridge.ts  Local resume / continue reconstruction
  oauth.ts                  OAuth PKCE flow and token refresh
  token.ts                  Session persistence and credential discovery
  models.ts                 Dynamic model discovery and tier mapping
  logger.ts                 Structured console logging

tests/
  converter.test.ts              Format conversion coverage
  claude-session-bridge.test.ts  Resume / continue bridge coverage
  server.test.ts                 HTTP proxy route tests
  models.test.ts                 Model discovery tests
  token.test.ts                  Credential parsing tests

Other docs:
  CLAUDE_CODE_COMPATIBILITY.md   Claude Code feature compatibility matrix
```

---

## Acknowledgments

- [sst/opencode](https://github.com/sst/opencode) for Codex API integration references
- [openai/codex](https://github.com/openai/codex) for Codex schema and SSE behavior references
- [anthropics/claude-code](https://github.com/anthropics/claude-code) for the Claude Code client surface
- [cloverich/openclaw](https://github.com/cloverich/openclaw) for cross-reference ideas

---

## License

[GPL-3.0](LICENSE)
