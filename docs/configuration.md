# Configuration

## Clients

The server speaks MCP over stdio. Every client needs the same three things: the command `npx`, the arguments `-y agent-fastpath start`, and `TYPESAFE_API_KEY` in the environment.

**Claude Code**

```bash
claude mcp add agent-fastpath -s user -e TYPESAFE_API_KEY=<key> -- npx -y agent-fastpath start
```

`-s user` makes it available in every project. Without it the server is only registered for the directory you ran the command in.

**Cursor** (`~/.cursor/mcp.json`)

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

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.agent-fastpath]
command = "npx"
args = ["-y", "agent-fastpath", "start"]
env = { TYPESAFE_API_KEY = "<key>" }
```

`npx agent-fastpath install-config <client>` prints these snippets.

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
