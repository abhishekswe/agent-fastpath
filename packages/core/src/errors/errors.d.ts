/**
 * Standard typed error hierarchy for agentctl-fastpath.
 */
export declare class FastpathError extends Error {
    readonly code: string;
    readonly status: 'review' | 'escalate' | 'blocked' | 'error';
    readonly retryable: boolean;
    readonly details?: unknown | undefined;
    constructor(message: string, code: string, status?: 'review' | 'escalate' | 'blocked' | 'error', retryable?: boolean, details?: unknown | undefined);
}
export declare class PolicyBlockedError extends FastpathError {
    constructor(message: string, details?: unknown);
}
export declare class IrreversibleActionError extends FastpathError {
    constructor(actionName: string);
}
export declare class StaleObservationError extends FastpathError {
    constructor(targetRef: string, expectedObsId: string, currentObsId: string);
}
export declare class SSRFBlockedError extends FastpathError {
    constructor(targetUrl: string, reason: string);
}
export declare class PathTraversalError extends FastpathError {
    constructor(requestedPath: string, allowedRoots: string[]);
}
export declare class LowConfidenceEscalationError extends FastpathError {
    constructor(confidence: number, threshold: number, reason: string);
}
export declare class ProviderUnavailableError extends FastpathError {
    constructor(providerId: string, cause?: string);
}
//# sourceMappingURL=errors.d.ts.map