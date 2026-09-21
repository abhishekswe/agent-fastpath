/**
 * Core contract and type definitions for agentctl-fastpath.
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

export interface FastpathPolicyConfig {
  confidenceThreshold?: number; // default 0.75
  minMargin?: number; // minimum probability margin between top and runner-up
  escalateOnAmbiguity?: boolean;
  allowIrreversible?: boolean;
  maxStateSizeBytes?: number; // default 256KB
  redactSecrets?: boolean; // default true
}

export interface FastpathMetrics {
  latencyMs: number;
  estimatedTokensSaved: number;
  hostTurnsSaved: number;
  provider: string;
  stateBytesEvaluated: number;
  decisionPath: 'deterministic' | 'semantic_jev' | 'browser' | 'escalation';
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
  recommendedAction?: 'proceed' | 'inspect_evidence' | 'ask_user' | 'fallback_large_model';
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

export type BrowserMode = 'open' | 'observe' | 'act' | 'check' | 'choose' | 'run_bounded';

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
}

export interface BrowserAction {
  operation: BrowserOperation;
  targetRef?: string;
  textValue?: string;
  selectOption?: string;
}

export interface BrowserBounds {
  maxSteps?: number;
  timeoutMs?: number;
  allowedOrigins?: string[];
  allowPrivateNetworks?: boolean;
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
    allowedBrowserOrigins: string[];
  };
  security: {
    ssrfProtectionEnabled: boolean;
    irreversibleActionGateEnabled: boolean;
    redactionEnabled: boolean;
  };
}
