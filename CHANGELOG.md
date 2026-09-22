# Changelog

## [0.2.0] - 2026-09-22

### Added

- `install-config` now prints setup for Google Antigravity, Gemini CLI, OpenCode, VS Code (GitHub Copilot), Cline, Zed, Amp, and Pi (via pi-mcp-adapter), plus a `generic` target for any other `mcpServers` client.
- Setup guides for every supported client in `docs/configuration.md`.

### Changed

- An unknown `install-config` client now lists every supported value.

## [0.1.1] - 2026-09-22

### Fixed

- Avoided false ship-gate failures for HTTP status codes, retry descriptions, login-attempt documentation, and red-to-green test narratives (FP1).
- Mapped deterministic `BLOCKED` and `HIGH_RISK` decisions to safe statuses and actions (FP2).
- Corrected semantic browser claim handling, including negative-claim confidence and review status (FP3).
- Persisted browser traces in the evidence store with URL and mode diagnostics (FP4).
- Based browser token accounting on compact parsed observations rather than raw HTML (FP5).
- Prevented diffs with green test summaries from receiving a deterministic auto-pass (FP6).
- Corrected severity handling for insufficient information and ambiguity gating for clear requests.

### Changed

- Renamed the package from `agentctl-fastpath` to `agent-fastpath`. The old package is deprecated and points here.
- Documented the TypeSafe provider data boundary and the difference between host-context reduction and provider transmission.
- Strengthened exact regression, browser evidence, packaging, and release verification.

## [0.1.0] - 2026-09-21

- Initial npm release with typed evaluation, file triage, bounded browser control, evidence traces, and capability discovery.
