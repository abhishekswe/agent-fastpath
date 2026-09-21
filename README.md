# agentctl-fastpath

An MCP server that takes small, well-defined judgment calls off your coding agent's plate: is this CI log ready to ship, which of these 40 files handle auth, did the page actually say "Order confirmed". It answers with typed, calibrated results in milliseconds to a couple of seconds, and hands control back when it is not sure.

Works with Claude Code, Cursor, Codex, and any MCP client.

## Tools

| Tool | What it does |
| --- | --- |
| `fastpath_evaluate` | Answers typed questions about text: a choice, a score, or a yes/no probability. Presets cover common cases (`ship_gate`, `risk`, `severity`, `ambiguity`, `relevance`, `verify_claim`, and more). |
| `fastpath_triage` | Ranks files by relevance to a query. The server reads the files, so they never enter your agent's context. |
| `fastpath_browser` | Drives a headless browser one step at a time and returns a short element table instead of screenshots or HTML. |
| `fastpath_evidence` | Explains a previous result: questions asked, full distributions, gate decision. |
| `fastpath_capabilities` | Shows the active provider, limits, and security settings. |

Every result has a `status`:

- `accept`: confident, act on it.
- `review`: plausible, check the evidence first.
- `escalate`: not confident, or the input needs a human (for example, contradictory requirements). Decide yourself or ask the user.

## Install

Requires Node 20.12+ and a [TypeSafe](https://typesafe.ai) API key.

```bash
claude mcp add agentctl-fastpath -s user -e TYPESAFE_API_KEY=<key> -- npx -y agentctl-fastpath start
npx playwright install chromium   # only needed for the browser tool
```

For Cursor, Codex, and all settings, see [configuration](docs/configuration.md). Check your setup with `npx agentctl-fastpath doctor`.

Without an API key the server still runs: deterministic checks work, and semantic questions return `escalate` instead of guessing.

## Example

```json
{
  "tool": "fastpath_evaluate",
  "arguments": {
    "preset": "ambiguity",
    "state": "Update the user record immediately, but defer all database writes until midnight."
  }
}
```

```json
{
  "status": "escalate",
  "decision": true,
  "reasonCode": "AMBIGUITY_DETECTED",
  "recommendedAction": "ask_user",
  "answers": {
    "is_ambiguous": { "noul": 0.85, "answer": true, "confidence": 0.85 },
    "ambiguity_type": { "choice": "contradictory", "confidence": 0.9, "probabilities": { "contradictory": 0.93, "underspecified": 0.06, "missing_context": 0.01, "none": 0 } }
  },
  "traceId": "trc_6ae27274499cf7e7"
}
```

## How it decides

1. **Rules first.** Clear-cut cases are answered by code in under a millisecond: a failing test run blocks `ship_gate`, `git push --force` is `HIGH_RISK`.
2. **Then a fast model.** Everything else goes to TypeSafe System One in a single request.
3. **Then a confidence gate.** Low confidence or near-tied options return `review` or `escalate` instead of an answer.

More in [architecture](docs/architecture.md).

## Safety

- The browser cannot reach localhost, private networks, or cloud metadata endpoints. Every connection, including redirects and page scripts, goes through a checking proxy.
- Clicking anything labelled like delete, buy, pay, or publish requires `allowIrreversible: true`.
- Triage reads only inside the directories you allow.
- Secrets are redacted before anything leaves the machine.
- Tool callers can tighten these limits but not loosen them.

Details and known limits: [security](docs/security.md).

## Development

```bash
npm install
npx playwright install chromium
npm run check        # typecheck, tests, build, and a smoke test of the built CLI
npm run test:live    # the full scenario suite against the real API (needs TYPESAFE_API_KEY)
npm run bench        # context and latency benchmark (needs TYPESAFE_API_KEY)
```

## License

MIT
