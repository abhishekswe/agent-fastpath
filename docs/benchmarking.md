# Benchmark

```bash
TYPESAFE_API_KEY=<key> npm run bench
```

The benchmark runs against the real provider; it refuses to run without a key rather than report mock numbers.

## What it measures

- **Host tokens:** what the host agent would read to do the task itself: every source file for triage, the log for the ship gate. Estimated as characters / 4.
- **Fastpath tokens:** the size of the JSON response the host reads instead.
- **Latency:** wall-clock time for the call.

## Results

Run on this repository (35 TypeScript files), September 2026:

| Scenario | Host tokens | Fastpath tokens | Latency | Result |
| --- | --- | --- | --- | --- |
| Triage 35 source files for "SSRF protection" | 35,256 | 408 | 2.9 s | top hit `network_policy.ts` |
| Ship gate, clean CI log | 18 | 86 | 1 ms | `READY_TO_SHIP` (deterministic) |
| Ship gate, no test evidence | 36 | 127 | 328 ms | `NEEDS_REVIEW` |

Triage is where context savings come from: the host never reads the files. For short inputs like a CI log the response is larger than the input; the gain there is a fast, typed, repeatable verdict instead of the host reasoning through the log.

The `estimatedTokensSaved` field in every response follows the same rule: it counts only content the server read on the host's behalf (files, page HTML), minus the response. For `fastpath_evaluate`, where the host already sent the state, it is 0.
