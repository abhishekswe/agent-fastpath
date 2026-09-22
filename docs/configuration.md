# Configuration

## Clients

The server speaks MCP over stdio. Every client needs the same three things: the command `npx`, the arguments `-y agent-fastpath start`, and `TYPESAFE_API_KEY` in the environment.

`npx agent-fastpath install-config <client>` prints the snippet for your client. Supported values: `claude-code`, `codex`, `cursor`, `antigravity`, `gemini-cli`, `opencode`, `vscode`, `cline`, `zed`, `amp`, `pi`, `generic`.

| Client | Where the config goes |
| --- | --- |
| Claude Code | `claude mcp add` command |
| Codex | `~/.codex/config.toml` |
| Cursor | `~/.cursor/mcp.json` |
| Google Antigravity | `~/.gemini/config/mcp_config.json` |
| Gemini CLI | `gemini mcp add` command |
| OpenCode | `~/.config/opencode/opencode.json` |
| VS Code (GitHub Copilot) | `.vscode/mcp.json` |
| Cline | MCP Servers > Configure MCP Servers |
| Zed | Zed `settings.json` |
| Amp | Amp `settings.json` |
| Pi | `~/.pi/agent/mcp.json`, via pi-mcp-adapter |
| Anything else | the client's `mcpServers` config |

### Claude Code

```bash
claude mcp add agent-fastpath -s user -e TYPESAFE_API_KEY=<key> -- npx -y agent-fastpath start
```

`-s user` makes it available in every project. Without it the server is only registered for the directory you ran the command in.

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.agent-fastpath]
command = "npx"
args = ["-y", "agent-fastpath", "start"]
env = { TYPESAFE_API_KEY = "<key>" }
```

### Cursor, Google Antigravity, Cline, and other `mcpServers` clients

Most clients share this shape. Put it in the file for your client: `~/.cursor/mcp.json` (Cursor), `~/.gemini/config/mcp_config.json` (Antigravity, then restart it), or Cline's MCP settings. Claude Desktop, Kiro, Warp, Kilo Code, and Roo Code use the same shape.

```json
{
  "mcpServers": {
    "agent-fastpath": {
      "command": "npx",
      "args": ["-y", "agent-fastpath", "start"],
      "env": { "TYPESAFE_API_KEY": "<key>" }
    }
  }
}
```

### Gemini CLI

```bash
gemini mcp add -s user -e TYPESAFE_API_KEY=<key> agent-fastpath npx -y agent-fastpath start
```

### OpenCode

`~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "agent-fastpath": {
      "type": "local",
      "command": ["npx", "-y", "agent-fastpath", "start"],
      "enabled": true,
      "environment": { "TYPESAFE_API_KEY": "<key>" }
    }
  }
}
```

### VS Code (GitHub Copilot)

`.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "agent-fastpath": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agent-fastpath", "start"],
      "env": { "TYPESAFE_API_KEY": "<key>" }
    }
  }
}
```

### Zed

Zed `settings.json`:

```json
{
  "context_servers": {
    "agent-fastpath": {
      "command": "npx",
      "args": ["-y", "agent-fastpath", "start"],
      "env": { "TYPESAFE_API_KEY": "<key>" }
    }
  }
}
```

### Amp

Amp `settings.json`:

```json
{
  "amp.mcpServers": {
    "agent-fastpath": {
      "command": "npx",
      "args": ["-y", "agent-fastpath", "start"],
      "env": { "TYPESAFE_API_KEY": "<key>" }
    }
  }
}
```

### Pi

Pi reads MCP servers through [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter):

```bash
pi install npm:pi-mcp-adapter
```

Then add the `mcpServers` block above to `~/.pi/agent/mcp.json` and restart Pi.

## Environment variables

Security limits are set here, by you. Tool callers can tighten them per call but never loosen them.

| Variable | Default | Meaning |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | unset | Enables semantic judgment. Without it, deterministic checks still work and semantic questions return `escalate`. |
| `FASTPATH_ROOTS` | working directory | Directories triage may read, separated by `:` (`;` on Windows). |
| `FASTPATH_BROWSER_ORIGINS` | any public origin | Comma-separated navigation allowlist, e.g. `https://example.com,*.example.org`. |
| `FASTPATH_ALLOW_PRIVATE_NETWORKS` | off | `1` lets the browser reach localhost and private IPs. Use for testing local apps. |
| `FASTPATH_MAX_BROWSER_STEPS` | `5` | Most actions per browser session. |
| `FASTPATH_MAX_STATE_BYTES` | `262144` | Largest `state` accepted by `fastpath_evaluate`. |
| `FASTPATH_BROWSER_TIMEOUT_MS` | `15000` | Navigation timeout. |
| `FASTPATH_BROWSER_NO_SANDBOX` | off | `1` disables the Chromium sandbox. Only for containers running as root. |

A `.env` file in the server's working directory is loaded at startup. Prefer the client's `env` block.

## Browser runtime

The browser tool needs Chromium:

```bash
npx playwright install chromium
```

`npx agent-fastpath doctor` checks Node, the API key, and the browser.
