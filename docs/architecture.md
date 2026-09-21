# Architecture

```
host agent (Claude Code, Cursor, Codex)
        │  MCP over stdio
        ▼
agentctl-fastpath
  ├─ fastpath_evaluate ─┐
  ├─ fastpath_triage ───┼─► capability router
  │                     │     1. redact secrets, enforce size limit
  │                     │     2. deterministic rules (CI logs, destructive commands)
  │                     │     3. judgment provider (TypeSafe System One)
  │                     │     4. confidence gate → accept / review / escalate
  ├─ fastpath_browser ──┼─► browser provider (Playwright, egress proxy)
  │                     │     semantic steps (check, choose) go back through the router
  ├─ fastpath_evidence ─┴─► in-memory trace store
  └─ fastpath_capabilities
```

## Decision order

1. **Deterministic rules.** If a regex can answer with certainty, it does, in under a millisecond: failing or passing CI output for `ship_gate`, `rm -rf /` or `DROP TABLE` for `risk`, an OOM crash for `severity`.
2. **Semantic judgment.** Otherwise the questions go to TypeSafe System One in one request. Each answer is typed: `choice` (option plus distribution), `score` (0-based level plus distribution), or `noul` (probability of yes).
3. **Confidence gate.** Every answer has a confidence on the same scale: the probability of the reported answer.
   - Below `escalationThreshold` (0.55): `escalate`. Decide yourself or ask the user.
   - Top two choices within `minMargin` (0.15): `review`.
   - At or above `confidenceThreshold` (0.75): `accept`.
   - Otherwise: `review`.
4. **Preset overrides.** A preset can escalate on its own finding. `ambiguity` escalates with `recommendedAction: "ask_user"` when it detects ambiguity, even when the model is sure, because the user has to resolve it.

## Packages

| Package | Role |
| --- | --- |
| `core` | Types, config, router, gate, presets, deterministic rules, redaction, traces |
| `provider-typesafe` | TypeSafe System One client, answer normalization, test mock, unavailable placeholder |
| `provider-browser` | Playwright sessions, element extraction, network policy, egress proxy |
| `mcp-server` | Tool schemas and handlers, server wiring, stdio entrypoint |
| `cli` | The published `agentctl-fastpath` command; bundles the packages above |
| `benchmark` | Measures context avoided and latency against the real provider |

Only `cli` is published. The others are internal workspace packages bundled into it at build time.
