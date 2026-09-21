# ⚡ agentctl-fastpath

> **Local-first MCP acceleration layer for AI coding agents (Claude Code, Codex, Cursor, OpenCode). Fast, typed decisions, bounded triage, and token-efficient browser operations powered by deterministic logic and TypeSafe System One (Jev).**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript: 5.7+](https://img.shields.io/badge/TypeScript-5.7+-3178C6.svg)](https://www.typescriptlang.org/)
[![Node: 20+](https://img.shields.io/badge/Node-20+-228B22.svg)](https://nodejs.org/)
[![Powered by: TypeSafe Jev](https://img.shields.io/badge/Powered%20by-TypeSafe%20Jev-black)](https://typesafe.ai)

---

## 🎯 Purpose

Host AI coding agents (like Claude Code, Codex, and Cursor) often consume tens of thousands of tokens and multiple seconds of latency attempting to parse raw logs, scan entire directory trees, and inspect full web accessibility trees.

`agentctl-fastpath` sits between the host agent and local/web resources as a **local MCP acceleration server**. It is **not** an autonomous agent—it remains completely idle until called, executing bounded operations and returning compact, typed JSON with calibrated probabilities and tokens-saved metrics.

### Core Architectural Hierarchy
1. **Deterministic Logic First**: Ordinary TypeScript code handles schema validation, parsing, exact string/regex matches, test failure detection, and secret redaction in <1ms without calling remote models.
2. **TypeSafe System One (Jev) Second**: When semantic judgment is required, multi-question speculative queries execute in a single network pass, returning typed answers (choice, score, noul) and calibrated distributions.
3. **Bounded Browser Provider Third**: Performs atomic page observations with cryptographic observation tokens (`obs_<uuid>:<index>`), rejecting stale targets, blocking SSRF, and requiring confirmation for destructive actions.
4. **Escalation Gate Fourth**: If confidence is below threshold (<0.75) or answers are ambiguous, control is immediately returned to the host agent with reason codes.

---

## 🛠️ MCP Tools Exposed

`agentctl-fastpath` exposes exactly 5 compact tools:

1. **`fastpath_evaluate`**: Run fast typed semantic evaluation (choice/score/noul or presets like `ship_gate`, `relevance`, `risk`, `severity`, `intent`) over state without conversational prose.
2. **`fastpath_triage`**: Rank or filter files or items against a query without putting all full contents into the host LLM context.
3. **`fastpath_browser`**: Perform bounded browser operations (`open`, `observe`, `act`, `check`, `choose`, `run_bounded`) with atomic observation token validation.
4. **`fastpath_evidence`**: Retrieve expanded evidence, question breakdowns, and raw probability distributions for a previous `traceId`.
5. **`fastpath_capabilities`**: Report active providers, limits, presets, and security settings without exposing secrets.

---

## 🚀 Quick Start

### 1. Installation & Environment Check
```bash
# Clone or navigate to the repository
cd scratch/agentctl-fastpath

# Install dependencies and build
npm install
npm run build

# Run environment verification doctor
npm run doctor
```

### 2. Configure Your Client

#### Claude Code:
```bash
claude mcp add agentctl-fastpath -- npx -y agentctl-fastpath start
```

#### Cursor (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "agentctl-fastpath": {
      "command": "npx",
      "args": ["-y", "agentctl-fastpath", "start"],
      "env": {
        "TYPESAFE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

---

## 🧪 Verification & Benchmarks

Run the complete automated test suite (unit, contract, security, and e2e integration):
```bash
npm test
```

Run the token reduction benchmark harness:
```bash
npm run bench
```

Sample Benchmark Output:
```
┌─────────┬───────────────────────────────┬────────────┬─────────────────┬─────────────┬──────────────┬────────┐
│ (index) │ Scenario                      │ Raw Tokens │ Fastpath Tokens │ Reduction % │ Latency (ms) │ Passed │
├─────────┼───────────────────────────────┼────────────┼─────────────────┼─────────────┼──────────────┼────────┤
│ 0       │ 'Repository File Triage'      │ 651        │ 116             │ '82%'       │ 1            │ true   │
│ 1       │ 'CI Verification & Ship Gate' │ 160        │ 87              │ '46%'       │ 0            │ true   │
└─────────┴───────────────────────────────┴────────────┴─────────────────┴─────────────┴──────────────┴────────┘
```

---

## 📚 Documentation
- [Architecture & Design Decisions](docs/architecture.md)
- [Security Model & STRIDE Analysis](docs/security.md)
- [Pluggable Provider Guide](docs/providers.md)
- [Benchmark Methodology](docs/benchmarking.md)
- [Client Configuration](docs/mcp-clients.md)

---

## 📄 License
MIT © 2026 agentctl contributors.
