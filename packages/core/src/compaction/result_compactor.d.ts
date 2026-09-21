/**
 * Result Compactor: Compresses outputs into minimal typed shapes,
 * avoids leaking raw context, and measures tokens avoided.
 */
import { FastpathMetrics } from '../contracts/types.js';
export declare class ResultCompactor {
    /**
     * Estimates tokens from character count using standard ~4 chars/token heuristic.
     */
    static estimateTokens(text: string): number;
    /**
     * Calculates metrics for tokens and turns avoided by using the fast path.
     */
    static computeMetrics(rawState: string | Record<string, unknown>, compactResponse: unknown, latencyMs: number, provider: string, decisionPath: 'deterministic' | 'semantic_jev' | 'browser' | 'escalation'): FastpathMetrics;
    /**
     * Extracts compact evidence reference without returning full raw dumps.
     */
    static extractCompactSnippet(text: string, maxLength?: number): string;
}
//# sourceMappingURL=result_compactor.d.ts.map