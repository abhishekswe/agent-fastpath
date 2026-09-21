/**
 * TypeSafe System One (Jev) Judgment Provider implementation.
 */
import { JudgmentProvider, JudgmentRequest, JudgmentResult } from '@agentctl/core';
export interface TypeSafeClientOptions {
    apiKey?: string;
    endpoint?: string;
    model?: string;
    timeoutMs?: number;
    maxRetries?: number;
}
export declare class TypeSafeJudgmentProvider implements JudgmentProvider {
    readonly id = "typesafe";
    private apiKey;
    private endpoint;
    private model;
    private timeoutMs;
    private maxRetries;
    constructor(options?: TypeSafeClientOptions);
    getModelName(): string;
    isConfigured(): boolean;
    evaluate(request: JudgmentRequest): Promise<JudgmentResult>;
    checkHealth(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
}
//# sourceMappingURL=client.d.ts.map