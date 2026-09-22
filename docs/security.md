# Security model

The caller of every tool is an LLM, and the content it handles (web pages, files, logs) may be written by an attacker. So the server treats tool arguments and content as untrusted, and keeps security limits under the operator's control.

## What the server enforces

**Operator-owned limits.** Filesystem roots, private-network access, the origin allowlist, the step cap, and the state size cap come from environment variables (see [configuration](configuration.md)). A tool call can narrow them (`allowedRoots`, `bounds`, `policy.maxStateSizeBytes`) but a request to widen them is rejected.

**Filesystem.** Triage reads only paths inside the allowed roots, after resolving symlinks. Each file is read up to 64 KB.

**Network (SSRF).** The browser cannot reach loopback, private, link-local, CGNAT, multicast, or reserved addresses, in IPv4 or IPv6 form (including IPv4-mapped and NAT64 addresses). Two layers enforce this:

1. Before navigation, the URL is parsed, its origin checked against the allowlist, and its hostname resolved. Any non-public address in the answer blocks it.
2. Chromium is forced through a per-session local proxy, including for localhost. The proxy resolves each destination and connects to the exact address it checked. This covers redirects, images, scripts, `fetch`, and WebSockets, and prevents a DNS answer from changing between check and connect. Non-proxied WebRTC UDP is disabled. Blocked requests are reported in the observation's `anomalies`.

After every navigation and action the final URL is checked against the allowlist again, so a redirect or click cannot leave it.

**Irreversible actions.** Elements whose label names a destructive or financial action (delete, remove, buy, pay, checkout, transfer, unsubscribe, publish, deploy, merge, and similar) are flagged `IRREVERSIBLE`. Acting on one fails with `IRREVERSIBLE_ACTION_NOT_CONFIRMED` unless the call sets `allowIrreversible: true`, which the host should do only after the user confirms. `run_bounded` never takes irreversible actions, and `choose` does not offer them.

**Stale targets.** Element refs look like `obs_<id>:<n>` and are valid only for the latest observation. After the page changes, old refs are rejected with `STALE_OBSERVATION_REFERENCE`.

**Secrets and provider data.** State is redacted before it reaches the judgment provider or the trace store: private key blocks, TypeSafe, OpenAI, Anthropic, GitHub, AWS, and Slack keys, bearer tokens, `*_API_KEY=`/`*_SECRET=`/`*_PASSWORD=` assignments, and JSON password fields. Triage reads at most 64 KB per file, sends at most 4,000 characters of each file for semantic relevance scoring, and redacts the returned snippet. Redaction cannot be turned off by a caller.

Semantic evaluation is not local-only: redacted state and bounded triage excerpts are sent to the configured TypeSafe endpoint. The context-saving claim means the MCP host does not receive full source files; it does not mean source-derived excerpts never leave the machine. Keep `FASTPATH_ROOTS` narrow and exclude material that must never be sent to a provider.

**No fabricated answers.** Without an API key, semantic questions return `escalate` with `JUDGMENT_PROVIDER_UNAVAILABLE`. The keyword mock used in tests is never selected automatically.

**Browser process.** Chromium runs headless with its sandbox on, downloads and service workers disabled, and each session in its own context. Sessions close after 5 idle minutes, on `mode: "close"`, and when the server exits.

## Known limits

- **Irreversible detection reads labels.** A button labelled "Continue" that places an order will not be flagged. Keep the host in the loop for purchases and account changes.
- **Page content can influence semantic answers.** A page can contain text aimed at the judge. The gate limits the damage (low confidence escalates, `run_bounded` only clicks and never irreversibly), but treat `choose` recommendations as suggestions.
- **Traces stay in memory.** The last 500 traces are kept in the server process and never written to disk. They contain redacted state summaries.
- **Redaction is pattern based.** It cannot identify every proprietary secret format or sensitive natural-language passage. Do not treat it as a data-loss-prevention system.
- **The browser engine is Chromium.** Browser vulnerabilities apply. Keep Playwright updated.

## Reporting a vulnerability

Open a private security advisory on GitHub: https://github.com/abhishekswe/agentctl-fastpath/security/advisories/new
