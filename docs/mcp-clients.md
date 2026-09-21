# Host MCP Client Configuration Guide

`agentctl-fastpath` communicates over standard stdio MCP and can be configured with any compatible host agent.

---

## 1. Claude Code

Run the following command in your terminal:

```bash
claude mcp add agentctl-fastpath -- npx -y agentctl-fastpath start
```

Or configure via `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "agentctl-fastpath": {
      "command": "npx",
      "args": ["-y", "agentctl-fastpath", "start"],
      "env": {
        "TYPESAFE_API_KEY": "<your_typesafe_api_key_here>"
      }
    }
  }
}
```

---

## 2. Cursor

Add the following to `~/.cursor/mcp.json` or your project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentctl-fastpath": {
      "command": "npx",
      "args": ["-y", "agentctl-fastpath", "start"],
      "env": {
        "TYPESAFE_API_KEY": "<your_typesafe_api_key_here>"
      }
    }
  }
}
```

---

## 3. Codex & OpenCode / Generic Stdio MCP Clients

Configure your tool runner with:
- **Executable:** `npx`
- **Arguments:** `["-y", "agentctl-fastpath", "start"]`
- **Environment:** `TYPESAFE_API_KEY=<your_key>`
