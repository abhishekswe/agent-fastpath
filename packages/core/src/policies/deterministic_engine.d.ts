/**
 * Deterministic Engine: Handles exact computations, schema validation,
 * regex patterns, safety policies, and path validation in pure TypeScript.
 */
export interface DeterministicEvaluationResult {
    handled: boolean;
    decision?: string | number | boolean;
    confidence: number;
    reasonCode: string;
    details?: Record<string, unknown>;
}
export declare class DeterministicEngine {
    /**
     * Evaluates whether a query/state can be fully answered with exact deterministic rules.
     */
    static evaluateExact(state: string | Record<string, unknown>, preset?: string, params?: Record<string, unknown>): DeterministicEvaluationResult;
    /**
     * Validates and confines filesystem paths to authorized roots.
     * Defends against directory traversal (../) and symlink escaping.
     */
    static validatePathWithinRoots(targetPath: string, allowedRoots?: string[]): string;
    /**
     * Fast cryptographic SHA-256 state hashing for caching and deduplication.
     */
    static hashState(state: string | Record<string, unknown>): string;
    /**
     * Redacts sensitive secrets, API keys, tokens, and credentials from text strings.
     */
    static redactSecrets(content: string): {
        redacted: string;
        redactions: string[];
    };
}
//# sourceMappingURL=deterministic_engine.d.ts.map