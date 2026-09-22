# Changelog

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

- Documented the TypeSafe provider data boundary and the difference between host-context reduction and provider transmission.
- Strengthened exact regression, browser evidence, packaging, and release verification.

## [0.1.0] - 2026-09-21

- Initial npm release with typed evaluation, file triage, bounded browser control, evidence traces, and capability discovery.
