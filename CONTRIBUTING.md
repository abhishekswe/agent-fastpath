# Contributing

Contributions are welcome, especially reproducible bug reports, safety regressions, provider integrations, and measurements that improve the documented benchmark.

## Development setup

Requirements: Node.js 20.12 or newer and Chromium for Playwright.

```bash
npm ci
npx playwright install chromium
npm run check
```

`npm run check` runs typechecking, unit/integration/browser tests, the build, and built-CLI smoke tests. Browser tests use local fixtures and do not call the judgment API.

Live provider checks are separate because they use a real TypeSafe key and network quota:

```bash
TYPESAFE_API_KEY=<your-key> npm run test:live
```

The live triage scenario reads this public repository. Do not change it to read private repositories or user files.

## Change requirements

- Add a regression test before fixing behavior and confirm that it fails for the intended reason.
- Test deterministic behavior without a model. Test semantic gates with `ScriptedProvider`; never make ordinary tests depend on a live provider.
- Use only clearly synthetic credentials in tests.
- Preserve the contract that `accept` is actionable, `review` requires inspection, and `escalate` hands control back to the host or user.
- Run `npm run check` before opening a pull request.
- Keep changes focused and explain user-visible behavior in `CHANGELOG.md`.

## Pull requests

Describe the problem, reproduction, solution, tests, and any security or provider-data implications. A pull request that changes browser actions, filesystem access, redaction, status/action mapping, or provider payloads must call out that boundary explicitly.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
