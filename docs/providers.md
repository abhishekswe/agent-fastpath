# Provider Integration Guide: agentctl-fastpath

`agentctl-fastpath` enforces strict boundaries between core routing policies and execution providers. Providers are pluggable interfaces that can be substituted without altering MCP tool schemas.

---

## 1. Judgment Provider (`JudgmentProvider`)

Responsible for executing typed evaluations against state using TypeSafe System One (Jev) models.

```typescript
export interface JudgmentRequest {
  state: string | Record<string, unknown>;
  questions: Record<string, QuestionDef>;
  deadlineMs?: number;
}

export interface JudgmentResult {
  answers: Record<string, TypedAnswer>;
  rawUsage?: { inputTokens?: number; outputTokens?: number };
  latencyMs: number;
  model: string;
}

export interface JudgmentProvider {
  readonly id: string;
  evaluate(request: JudgmentRequest): Promise<JudgmentResult>;
  checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}
```

### Implemented Providers:
- `TypeSafeJudgmentProvider` (`@agentctl/provider-typesafe`): Production integration communicating with `https://api.typesafe.ai/v1/systemone` using `@typesafe-ai/sdk` with exponential backoff retries and deadline enforcement.
- `MockTypeSafeProvider`: Deterministic offline provider for CI, development, and unit testing when `TYPESAFE_API_KEY` is not present.

---

## 2. Browser Provider (`BrowserProvider`)

Responsible for isolated, bounded browser lifecycle, atomic observation, and action execution.

```typescript
export interface BrowserProvider {
  readonly id: string;
  createSession(options?: BrowserSessionOptions): Promise<string>;
  closeSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): BrowserSessionInfo | undefined;
  navigate(sessionId: string, url: string): Promise<void>;
  observe(sessionId: string): Promise<BrowserObservation>;
  act(sessionId: string, action: BrowserAction, target?: InteractiveElement): Promise<BrowserActionResult>;
  checkOutcome(sessionId: string, assertion: string): Promise<BrowserOutcomeResult>;
  chooseAction(sessionId: string, goal: string): Promise<{ action: BrowserAction; confidence: number }>;
  checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}
```

### Implemented Providers:
- `PlaywrightBrowserProvider` (`@agentctl/provider-browser`): Launches isolated headless Chromium contexts on demand, enforces observation tokens (`obs_<hex>:<index>`), extracts interactive element summaries, and enforces SSRF boundaries.
