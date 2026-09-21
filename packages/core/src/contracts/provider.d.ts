/**
 * Provider interface specifications for agentctl-fastpath.
 */
import { BrowserAction, BrowserBounds, BrowserObservation, InteractiveElement, QuestionDef, TypedAnswer } from './types.js';
export interface JudgmentRequest {
    state: string | Record<string, unknown>;
    questions: Record<string, QuestionDef>;
    deadlineMs?: number;
}
export interface JudgmentResult {
    answers: Record<string, TypedAnswer>;
    rawUsage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
    latencyMs: number;
    model: string;
}
export interface JudgmentProvider {
    readonly id: string;
    evaluate(request: JudgmentRequest): Promise<JudgmentResult>;
    checkHealth(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
}
export interface BrowserSessionOptions {
    sessionId?: string;
    bounds?: BrowserBounds;
    headless?: boolean;
}
export interface BrowserSessionInfo {
    sessionId: string;
    createdAt: number;
    lastUsedAt: number;
    currentUrl: string;
    title: string;
}
export interface BrowserActionResult {
    success: boolean;
    operation: string;
    targetRef?: string;
    elapsedMs: number;
    details?: string;
    error?: string;
}
export interface BrowserOutcomeResult {
    satisfied: boolean;
    confidence: number;
    stepsExecuted: number;
    details?: string;
}
export interface BrowserProvider {
    readonly id: string;
    createSession(options?: BrowserSessionOptions): Promise<string>;
    closeSession(sessionId: string): Promise<void>;
    getSession(sessionId: string): BrowserSessionInfo | undefined;
    navigate(sessionId: string, url: string): Promise<void>;
    observe(sessionId: string): Promise<BrowserObservation>;
    act(sessionId: string, action: BrowserAction, target?: InteractiveElement): Promise<BrowserActionResult>;
    checkOutcome(sessionId: string, assertion: string): Promise<BrowserOutcomeResult>;
    chooseAction(sessionId: string, goal: string): Promise<{
        action: BrowserAction;
        confidence: number;
    }>;
    checkHealth(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
}
export interface TraceRecord {
    traceId: string;
    timestamp: string;
    tool: string;
    status: string;
    decisionPath: string;
    stateSummary?: string;
    questions?: Record<string, QuestionDef>;
    answers?: Record<string, TypedAnswer>;
    rawDistributions?: Record<string, unknown>;
    latencyBreakdownMs: Record<string, number>;
    redactionsApplied: string[];
    diagnostics?: Record<string, unknown>;
    estimatedTokensSaved: number;
}
export interface EvidenceStore {
    saveTrace(trace: TraceRecord): Promise<void>;
    getTrace(traceId: string): Promise<TraceRecord | null>;
    listRecent(limit?: number): Promise<TraceRecord[]>;
}
export interface MetricsEvent {
    tool: string;
    latencyMs: number;
    status: string;
    estimatedTokensSaved: number;
    hostTurnsSaved: number;
    provider: string;
    decisionPath: string;
}
export interface MetricsSink {
    record(event: MetricsEvent): void;
    getAggregate(): {
        totalCalls: number;
        totalTokensSaved: number;
        totalTurnsSaved: number;
        averageLatencyMs: number;
        escalationRate: number;
    };
}
//# sourceMappingURL=provider.d.ts.map