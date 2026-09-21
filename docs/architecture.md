# Architecture Specification: agentctl-fastpath

`agentctl-fastpath` is a local-first MCP server designed to accelerate host AI coding agents (such as Codex, Claude Code, Cursor, OpenCode, and compatible ChatGPT clients) by providing bounded semantic judgments, rapid triage, and token-efficient browser operations.

---

## 1. Core Architectural Principle

**Deterministic logic first, TypeSafe System One (Jev) second, Browser provider third, and Host Agent escalation last.**

```
                 Host Agent (Codex / Claude Code / Cursor)
                                    │
                                    │ stdio MCP request
                                    ▼
                      agentctl-fastpath Server
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    │                                                               │
    ▼                                                               ▼
1. Deterministic Engine                                     2. Bounded Security Gate
   • Schema validation                                         • SSRF & Private IP block
   • Regex failure / pass match                                • Path traversal confinement
   • Exact comparisons                                         • Irreversible action check
   • Secret redaction (API keys/passwords)                     • Secret redaction
    │ (if not deterministically resolved)                           │
    ▼                                                               ▼
3. Capability Router                                        4. Browser Provider
   • Selects optimal provider                                  • Atomic DOM observation
   • Formulates speculative questions                          • Cryptographic token binding
   • TypeSafe System One (Jev) API                             • Node-backed indexed targets
    │                                                               │
    └───────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
                         5. Confidence Gate
                            • Threshold validation (accept >= 0.75)
                            • Probability margin check (margin >= 0.15)
                            • Escalate / Review upon ambiguity
                                    │
                                    ▼
                         6. Result Compactor
                            • Minimal typed JSON
                            • Opaque trace_id in EvidenceStore
                            • Avoids sending raw files / DOM / logs
                                    │
                                    ▼
                         Compact Typed MCP Response
```

---

## 2. Decision Flow Hierarchy

1. **Deterministic Check:** If regular expressions, exit codes, exact strings, or known schemas can answer the request with 100% certainty (e.g. test runner failure logs or known destructive commands), the server resolves immediately in <1ms without calling remote APIs.
2. **Semantic Judgment:** When bounded judgment is required, the request is dispatched to TypeSafe System One (Jev). Questions (Choice, Score, Noul) are asked in parallel in a single speculative network pass.
3. **Bounded Browser Operations:** If the caller requests browser interaction, operations execute in bounded cycles (`open`, `observe`, `act`, `check`, `choose`, `run_bounded`). Interactive targets are stamped with ephemeral observation tokens (`obs_<uuid>:<index>`). Actions referencing stale observation tokens are immediately rejected.
4. **Escalation & Control:** If confidence is below threshold or choices are ambiguous, the server returns an `escalate` or `review` status with reason codes, passing control cleanly back to the host agent without guessing.

---

## 3. Tool Surface

| MCP Tool | Purpose | Primary Output |
| :--- | :--- | :--- |
| `fastpath_evaluate` | Run typed semantic evaluations or standard presets | Typed answers, confidence, margin, and metrics |
| `fastpath_triage` | Rank and filter items or repository files without raw context pollution | Top N ranked IDs, scores, and compact snippets |
| `fastpath_browser` | Execute one bounded browser operation or outcome verification | Compact element summary table and verification verdict |
| `fastpath_evidence` | Inspect expanded questions, raw distributions, and timing for a `traceId` | Full structured diagnostic record |
| `fastpath_capabilities` | Inspect active providers, presets, safety limits, and security configuration | Capabilities object without secrets |
