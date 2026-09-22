# Security policy

## Supported versions

Security fixes are provided for the latest `0.1.x` release. Upgrade to the newest patch before reporting a problem that may already be fixed.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use a [private GitHub security advisory](https://github.com/abhishekswe/agent-fastpath/security/advisories/new) and include:

- the affected version and operating system;
- the MCP client and relevant server configuration;
- a minimal reproduction;
- the expected and observed security boundary;
- whether credentials, private files, network targets, or irreversible actions were exposed.

Never include a live credential. Replace it with a clearly synthetic fixture.

## Data sent to the judgment provider

Semantic evaluations send redacted state to the configured TypeSafe endpoint. Path-based triage reads files locally, truncates each file to 64 KB and each semantic excerpt to 4,000 characters, redacts recognized secrets, and sends the bounded excerpt for relevance scoring. Triage keeps full files out of the MCP host context; it is not a local-only operation.

Deterministic decisions stay local. Without a TypeSafe API key, semantic decisions escalate rather than silently selecting the test mock.

Redaction is defense in depth, not a guarantee that arbitrary sensitive prose can be recognized. Configure `FASTPATH_ROOTS` narrowly and do not triage files that must never leave the machine.

## Enforced boundaries

- Files are confined to operator-configured roots after resolving symlinks.
- Browser traffic is checked for SSRF before navigation and forced through a per-session egress proxy. Loopback, private, metadata, link-local, multicast, and reserved targets are blocked by default.
- Browser origins and step counts can be narrowed by callers but not widened beyond server policy.
- Destructive and financial browser actions require explicit `allowIrreversible: true`; bounded autonomous runs never take them.
- Observation references are invalidated after the page changes.
- The last 500 evidence traces stay in process memory and are not persisted to disk.

## Non-goals and limitations

- Button-label inspection cannot identify every irreversible action.
- A malicious page can influence semantic judgments; browser recommendations remain advisory.
- Secret patterns cannot detect every proprietary credential format or sensitive natural-language passage.
- This project does not sandbox the MCP host or the external TypeSafe service.

More implementation detail is available in [docs/security.md](docs/security.md).
