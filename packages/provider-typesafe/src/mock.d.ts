/**
 * Deterministic Mock TypeSafe Provider for offline testing, benchmarks, and CI.
 */
import { JudgmentProvider, JudgmentRequest, JudgmentResult } from '@agentctl/core';
export declare class MockTypeSafeProvider implements JudgmentProvider {
    readonly id = "typesafe:mock";
    evaluate(request: JudgmentRequest): Promise<JudgmentResult>;
    checkHealth(): Promise<{
        healthy: boolean;
        latencyMs: number;
    }>;
}
//# sourceMappingURL=mock.d.ts.map