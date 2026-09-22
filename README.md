# agent-fastpath

**A Jev MCP server: a decision layer for your coding agent, built on TypeSafe Jev (System One model). Ship gates, risk checks, file triage, and browser verification, with typed, calibrated answers.**

[![npm](https://img.shields.io/npm/v/agent-fastpath)](https://www.npmjs.com/package/agent-fastpath)
[![CI](https://github.com/abhishekswe/agent-fastpath/actions/workflows/ci.yml/badge.svg)](https://github.com/abhishekswe/agent-fastpath/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Coding agents like Claude Code, Codex, and Cursor spend context and time on small decisions: is this CI log ready to ship, which of these 40 files handle auth, did the page actually say "Order confirmed". agent-fastpath answers them with typed, calibrated results in milliseconds to a couple of seconds, and hands control back when it is not sure.

- **Keeps files out of your agent's context.** Triage reads files on the server. In the [benchmark](docs/benchmarking.md), the agent read 408 tokens instead of 35,256.
- **Rules first, then Jev.** Clear-cut cases are decided by code in under a millisecond. The rest go to [TypeSafe Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), a System One model that returns typed decisions with calibrated probabilities instead of text.
- **Says when it is unsure.** Every result is `accept`, `review`, or `escalate`, so your agent knows when to ask you.
- **Safe browser.** Headless Playwright with SSRF protection and a gate on irreversible actions like delete or pay.

Works with any MCP client, with [setup guides](docs/configuration.md#clients) for Claude Code, Codex, Cursor, Google Antigravity, Gemini CLI, OpenCode, VS Code (GitHub Copilot), Cline, Zed, Amp, and Pi.

## Use cases

- **Ship gate for CI and test logs.** The `ship_gate` preset returns `READY_TO_SHIP`, `NEEDS_REVIEW`, or `BLOCKED`.
- **Find the relevant files without reading them.** `fastpath_triage` ranks up to 500 files against a query and returns short snippets.
- **Risk check before destructive commands.** The `risk` preset flags `rm -rf`, `git push --force`, `DROP TABLE`, and similar.
- **Catch ambiguous or contradictory requirements.** The `ambiguity` preset returns `ask_user` instead of guessing.
- **Verify what a web page says.** `fastpath_browser` checks claims like "the order was confirmed" against the live page.

## How it differs from a plain Jev connector

A basic Jev MCP server passes your agent's questions to Jev and returns the answer. agent-fastpath adds the parts an agent needs to act on that answer safely:

- **Ready-made presets** (`ship_gate`, `risk`, `severity`, `ambiguity`, `relevance`, `verify_claim`, and more), so the agent does not write question schemas.
- **Deterministic rules before Jev**, so obvious cases like a failing build or `git push --force` are decided instantly and never cost an API call.
- **A confidence gate** that turns low-confidence or near-tied answers into `review` or `escalate` instead of a guess.
- **Server-side file triage and a safe browser**, so files and page HTML stay out of your agent's context.
- **Secret redaction and evidence traces** for every decision.

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
claude mcp add agent-fastpath -s user -e TYPESAFE_API_KEY=<key> -- npx -y agent-fastpath start
npx playwright install chromium   # only needed for the browser tool
```

For any other client, print its config with `npx agent-fastpath install-config <client>`:

| Client | Command |
| --- | --- |
| Codex | `npx agent-fastpath install-config codex` |
| Cursor | `npx agent-fastpath install-config cursor` |
| Google Antigravity | `npx agent-fastpath install-config antigravity` |
| Gemini CLI | `npx agent-fastpath install-config gemini-cli` |
| OpenCode | `npx agent-fastpath install-config opencode` |
| VS Code (GitHub Copilot) | `npx agent-fastpath install-config vscode` |
| Cline | `npx agent-fastpath install-config cline` |
| Zed | `npx agent-fastpath install-config zed` |
| Amp | `npx agent-fastpath install-config amp` |
| Pi | `npx agent-fastpath install-config pi` |
| Anything else | `npx agent-fastpath install-config generic` |

Full setup for each client and all settings: [configuration](docs/configuration.md). Check your setup with `npx agent-fastpath doctor`.

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
2. **Then Jev.** Everything else goes to TypeSafe Jev, the System One model, in a single request.
3. **Then a confidence gate.** Low confidence or near-tied options return `review` or `escalate` instead of an answer.

More in [architecture](docs/architecture.md).

## Safety

- The browser cannot reach localhost, private networks, or cloud metadata endpoints. Every connection, including redirects and page scripts, goes through a checking proxy.
- Clicking anything labelled like delete, buy, pay, or publish requires `allowIrreversible: true`.
- Triage reads only inside the directories you allow.
- Recognized secret formats are redacted before semantic requests and evidence traces.
- Tool callers can tighten these limits but not loosen them.

Semantic evaluation sends redacted state to the configured TypeSafe endpoint. Path triage keeps full files out of the MCP host context, but sends bounded, redacted excerpts to TypeSafe for relevance scoring. Do not include files that must never leave the machine. See the [security policy](SECURITY.md) and [detailed security model](docs/security.md).

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

This package was previously published as `agentctl-fastpath`.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Release changes are recorded in [CHANGELOG.md](CHANGELOG.md).
