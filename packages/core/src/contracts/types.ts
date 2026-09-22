/**
 * Core contract and type definitions for agent-fastpath.
 */

export type EvaluationStatus = 'accept' | 'review' | 'escalate' | 'blocked' | 'error';

export type QuestionPrimitiveType = 'choice' | 'score' | 'noul';

export interface ChoiceQuestionDef {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
}

export interface ScoreQuestionDef {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export interface NoulQuestionDef {
  type: 'noul';
  instructions: string;
}

export type QuestionDef = ChoiceQuestionDef | ScoreQuestionDef | NoulQuestionDef;

export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  margin?: number;
  runnerUp?: string;
}

export interface ScoreAnswer {
  score: number;
  confidence: number;
  probabilities: number[];
}

export interface NoulAnswer {
  noul: number;
  answer: boolean;
  confidence: number;
}

export type TypedAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

/**
 * Per-call gating policy. Callers may tune how strict the gate is, but never
 * the server's security limits (see FastpathServerConfig).
 */
export interface FastpathPolicyConfig {
  /** Minimum confidence for `accept`. Default 0.75. */
  confidenceThreshold?: number;
  /** Below this confidence the result escalates instead of asking for review. Default 0.55. */
  escalationThreshold?: number;
  /** Minimum probability gap between the top choice and the runner-up. Default 0.15. */
  minMargin?: number;
  /** Escalate when a preset detects ambiguity, and review on narrow margins. Default true. */
  escalateOnAmbiguity?: boolean;
  /** Lower the state size limit for this call. Cannot exceed the server limit. */
  maxStateSizeBytes?: number;
}

/**
 * Server-side limits. Set by the operator (env vars or constructor options),
 * never by tool callers, because the caller is an LLM that can be prompt-injected.
 */
export interface FastpathServerConfig {
  /** Filesystem roots triage may read from. */
  allowedRoots: string[];
  /** Browser navigation allowlist. Empty means any public origin. */
  allowedOrigins: string[];
  /** Allow the browser to reach loopback, private, and link-local addresses. */
  allowPrivateNetworks: boolean;
  /** Hard cap on browser steps per session. */
  maxBrowserSteps: number;
  /** Hard cap on evaluate state size. */
  maxStateSizeBytes: number;
  /** Browser navigation timeout. */
  browserTimeoutMs: number;
}

export type DecisionPath = 'deterministic' | 'semantic_jev' | 'browser' | 'escalation';

export interface FastpathMetrics {
  latencyMs: number;
  estimatedTokensSaved: number;
  hostTurnsSaved: number;
  provider: string;
  stateBytesEvaluated: number;
  decisionPath: DecisionPath;
}

export interface FastpathEvaluateInput {
  state: string | Record<string, unknown>;
  questions?: Record<string, QuestionDef>;
  preset?: string;
  presetParams?: Record<string, unknown>;
  policy?: FastpathPolicyConfig;
  deadlineMs?: number;
}

export interface FastpathEvaluateOutput {
  status: EvaluationStatus;
  decision?: string | number | boolean;
  confidence: number;
  margin?: number;
  answers: Record<string, TypedAnswer>;
  reasonCode: string;
  recommendedAction?: 'proceed' | 'inspect_evidence' | 'ask_user' | 'fallback_large_model' | 'fix_and_retry';
  /** Human-readable detail for errors and escalations. */
  message?: string;
  traceId: string;
  metrics: FastpathMetrics;
}

export interface TriageItem {
  id: string;
  content?: string;
  path?: string;
  metadata?: Record<string, unknown>;
}

export interface RankedTriageItem {
  id: string;
  status: EvaluationStatus;
  score: number;
  confidence: number;
  reason?: string;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface FastpathTriageInput {
  query: string;
  items: TriageItem[];
  limit?: number;
  /** Narrow the server's allowed roots for this call. */
  allowedRoots?: string[];
  policy?: FastpathPolicyConfig;
  deadlineMs?: number;
}

export interface FastpathTriageOutput {
  status: EvaluationStatus;
  rankedItems: RankedTriageItem[];
  totalEvaluated: number;
  skippedCount: number;
  failures: Array<{ id: string; error: string }>;
  traceId: string;
  metrics: FastpathMetrics;
}

export type BrowserMode = 'open' | 'observe' | 'act' | 'check' | 'choose' | 'run_bounded' | 'close';

export type BrowserOperation =
  | 'click'
  | 'type'
  | 'select'
  | 'scroll_down'
  | 'scroll_up'
  | 'wait';

export interface InteractiveElement {
  ref: string; // formatted as "obs_<uuid>:<index>"
  index: number;
  tagName: string;
  role?: string;
  type?: string;
  label: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  options?: string[];
  isIrreversible?: boolean;
}

export interface BrowserObservation {
  observationId: string;
  url: string;
  title: string;
  summaryTable: string;
  elements: InteractiveElement[];
  pageHealthScore: number;
  anomalies: string[];
  /** Size of the page HTML the host did not have to read. */
  rawHtmlBytes?: number;
}

export interface BrowserAction {
  operation: BrowserOperation;
  targetRef?: string;
  textValue?: string;
  selectOption?: string;
}

/** Caller-supplied bounds. These can only tighten the server limits. */
export interface BrowserBounds {
  maxSteps?: number;
  timeoutMs?: number;
  allowedOrigins?: string[];
}

/** Effective per-session limits after merging caller bounds with server config. */
export interface SessionLimits {
  maxSteps: number;
  timeoutMs: number;
  allowedOrigins: string[];
  allowPrivateNetworks: boolean;
}

export interface FastpathBrowserInput {
  mode: BrowserMode;
  sessionId?: string;
  url?: string;
  action?: BrowserAction;
  goal?: string;
  assertion?: string;
  allowIrreversible?: boolean;
  bounds?: BrowserBounds;
}

export interface FastpathBrowserOutput {
  sessionId: string;
  closed?: boolean;
  status: EvaluationStatus;
  url: string;
  observation?: BrowserObservation;
  outcome?: {
    goalSatisfied: boolean;
    confidence: number;
    stepCount: number;
    actionTaken?: string;
    details?: string;
  };
  reasonCode: string;
  traceId: string;
  metrics: FastpathMetrics;
}

export interface FastpathEvidenceInput {
  traceId: string;
  detailLevel?: 'summary' | 'full';
}

export interface FastpathEvidenceOutput {
  traceId: string;
  timestamp: string;
  tool: string;
  status: EvaluationStatus;
  decisionPath: string;
  questions?: Record<string, QuestionDef>;
  answers?: Record<string, TypedAnswer>;
  rawDistributions?: Record<string, unknown>;
  latencyBreakdownMs: Record<string, number>;
  redactionsApplied: string[];
  diagnostics?: Record<string, unknown>;
}

export interface FastpathCapabilitiesOutput {
  version: string;
  providers: {
    judgment: { id: string; available: boolean; model: string };
    browser: { id: string; available: boolean; headless: boolean };
    deterministic: { available: boolean };
  };
  presets: string[];
  limits: {
    maxStateSizeBytes: number;
    defaultConfidenceThreshold: number;
    maxBrowserSteps: number;
    allowedFilesystemRoots: string[];
    /** Empty means any public origin. */
    allowedBrowserOrigins: string[];
    privateNetworksAllowed: boolean;
  };
  security: {
    ssrfProtectionEnabled: boolean;
    irreversibleActionGateEnabled: boolean;
    redactionEnabled: boolean;
  };
}
