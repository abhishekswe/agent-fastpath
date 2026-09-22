# Providers

Judgment and browser work sit behind two interfaces in `@agent-fastpath/core`, so either can be replaced without changing the tools.

## Judgment provider

```ts
interface JudgmentProvider {
  readonly id: string;
  readonly available: boolean; // false: the router escalates instead of calling evaluate
  readonly model: string;
  evaluate(request: JudgmentRequest): Promise<JudgmentResult>;
  checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}
```

Implementations:

- `TypeSafeJudgmentProvider`: calls `https://api.typesafe.ai/v1/systemone`. Retries timeouts, 429s, and 5xx twice with backoff; fails fast on other 4xx.
- `UnavailableJudgmentProvider`: used when no API key is set. Never called.
- `MockTypeSafeProvider`: keyword heuristics for tests. Selected only with `FASTPATH_JUDGMENT=mock` or in code.

Answers are normalized so every type reports `confidence` as the probability of its answer:

```ts
{ choice: 'sev1', confidence: 0.93, probabilities: { sev1: 0.95, sev2: 0.05 }, margin: 0.9, runnerUp: 'sev2' }
{ score: 2.35, confidence: 0.65, probabilities: [0, 0, 0.65, 0.35] }
{ noul: 0.18, answer: false, confidence: 0.82 }
```

## Browser provider

```ts
interface BrowserProvider {
  readonly id: string;
  createSession(options: { limits: SessionLimits }): Promise<string>;
  closeSession(sessionId: string): Promise<void>;
  closeAll(): Promise<void>;
  getSession(sessionId: string): BrowserSessionInfo | undefined;
  navigate(sessionId: string, url: string): Promise<void>;
  observe(sessionId: string): Promise<BrowserObservation>;
  act(sessionId: string, action: BrowserAction, options?: { allowIrreversible?: boolean }): Promise<BrowserActionResult>;
  checkOutcome(sessionId: string, assertion: string): Promise<BrowserOutcomeResult>; // exact phrase
  readPageText(sessionId: string, maxChars: number): Promise<string>;
  checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}
```

`PlaywrightBrowserProvider` is the implementation. A replacement must enforce the same guarantees: the network policy on every connection, the irreversible-action gate in `act`, and observation-bound refs. See [security](security.md).
