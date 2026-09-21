/**
 * Standard typed error hierarchy for agentctl-fastpath.
 */
export class FastpathError extends Error {
    code;
    status;
    retryable;
    details;
    constructor(message, code, status = 'error', retryable = false, details) {
        super(message);
        this.code = code;
        this.status = status;
        this.retryable = retryable;
        this.details = details;
        this.name = 'FastpathError';
    }
}
export class PolicyBlockedError extends FastpathError {
    constructor(message, details) {
        super(message, 'POLICY_BLOCKED', 'blocked', false, details);
        this.name = 'PolicyBlockedError';
    }
}
export class IrreversibleActionError extends FastpathError {
    constructor(actionName) {
        super(`Irreversible action '${actionName}' requires explicit confirmation (allowIrreversible: true).`, 'IRREVERSIBLE_ACTION_NOT_CONFIRMED', 'blocked', false, { actionName });
        this.name = 'IrreversibleActionError';
    }
}
export class StaleObservationError extends FastpathError {
    constructor(targetRef, expectedObsId, currentObsId) {
        super(`Target element '${targetRef}' is bound to observation '${expectedObsId}' but current observation is '${currentObsId}'. Element state may have mutated.`, 'STALE_OBSERVATION_REFERENCE', 'escalate', false, { targetRef, expectedObsId, currentObsId });
        this.name = 'StaleObservationError';
    }
}
export class SSRFBlockedError extends FastpathError {
    constructor(targetUrl, reason) {
        super(`Navigation to '${targetUrl}' was blocked by SSRF policy: ${reason}`, 'SSRF_PROHIBITED', 'blocked', false, { targetUrl, reason });
        this.name = 'SSRFBlockedError';
    }
}
export class PathTraversalError extends FastpathError {
    constructor(requestedPath, allowedRoots) {
        super(`Access to '${requestedPath}' is prohibited. Path must be confined within allowed roots: ${allowedRoots.join(', ')}`, 'PATH_TRAVERSAL_PROHIBITED', 'blocked', false, { requestedPath, allowedRoots });
        this.name = 'PathTraversalError';
    }
}
export class LowConfidenceEscalationError extends FastpathError {
    constructor(confidence, threshold, reason) {
        super(`Result confidence (${(confidence * 100).toFixed(1)}%) is below threshold (${(threshold * 100).toFixed(1)}%): ${reason}`, 'LOW_CONFIDENCE_ESCALATION', 'escalate', false, { confidence, threshold, reason });
        this.name = 'LowConfidenceEscalationError';
    }
}
export class ProviderUnavailableError extends FastpathError {
    constructor(providerId, cause) {
        super(`Provider '${providerId}' is unavailable${cause ? `: ${cause}` : ''}`, 'PROVIDER_UNAVAILABLE', 'error', true, { providerId, cause });
        this.name = 'ProviderUnavailableError';
    }
}
//# sourceMappingURL=errors.js.map