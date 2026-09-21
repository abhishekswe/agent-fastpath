/**
 * Standard typed error hierarchy for agentctl-fastpath.
 */

export class FastpathError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: 'review' | 'escalate' | 'blocked' | 'error' = 'error',
    public readonly retryable: boolean = false,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'FastpathError';
  }
}

export class PolicyBlockedError extends FastpathError {
  constructor(message: string, details?: unknown) {
    super(message, 'POLICY_BLOCKED', 'blocked', false, details);
    this.name = 'PolicyBlockedError';
  }
}

export class IrreversibleActionError extends FastpathError {
  constructor(actionName: string) {
    super(
      `Irreversible action '${actionName}' requires explicit confirmation (allowIrreversible: true).`,
      'IRREVERSIBLE_ACTION_NOT_CONFIRMED',
      'blocked',
      false,
      { actionName }
    );
    this.name = 'IrreversibleActionError';
  }
}

export class StaleObservationError extends FastpathError {
  constructor(targetRef: string, expectedObsId: string, currentObsId: string, reason?: string) {
    super(
      reason
        ? `Target '${targetRef}' rejected: ${reason}. Current observation is '${currentObsId}'.`
        : `Target element '${targetRef}' is bound to observation '${expectedObsId}' but current observation is '${currentObsId}'. Observe again and use a fresh ref.`,
      'STALE_OBSERVATION_REFERENCE',
      'escalate',
      false,
      { targetRef, expectedObsId, currentObsId }
    );
    this.name = 'StaleObservationError';
  }
}

export class SSRFBlockedError extends FastpathError {
  constructor(targetUrl: string, reason: string) {
    super(
      `Navigation to '${targetUrl}' was blocked by SSRF policy: ${reason}`,
      'SSRF_PROHIBITED',
      'blocked',
      false,
      { targetUrl, reason }
    );
    this.name = 'SSRFBlockedError';
  }
}

export class PathTraversalError extends FastpathError {
  constructor(requestedPath: string, allowedRoots: string[]) {
    super(
      `Access to '${requestedPath}' is prohibited. Path must be confined within allowed roots: ${allowedRoots.join(', ')}`,
      'PATH_TRAVERSAL_PROHIBITED',
      'blocked',
      false,
      { requestedPath, allowedRoots }
    );
    this.name = 'PathTraversalError';
  }
}

export class LowConfidenceEscalationError extends FastpathError {
  constructor(confidence: number, threshold: number, reason: string) {
    super(
      `Result confidence (${(confidence * 100).toFixed(1)}%) is below threshold (${(threshold * 100).toFixed(1)}%): ${reason}`,
      'LOW_CONFIDENCE_ESCALATION',
      'escalate',
      false,
      { confidence, threshold, reason }
    );
    this.name = 'LowConfidenceEscalationError';
  }
}

export class ProviderUnavailableError extends FastpathError {
  constructor(providerId: string, cause?: string) {
    super(
      `Provider '${providerId}' is unavailable${cause ? `: ${cause}` : ''}`,
      'PROVIDER_UNAVAILABLE',
      'error',
      true,
      { providerId, cause }
    );
    this.name = 'ProviderUnavailableError';
  }
}
