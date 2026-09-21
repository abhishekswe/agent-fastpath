/**
 * Cryptographic Observation Token Management:
 * Enforces that every interactive target reference is strictly bound
 * to a specific observation cycle and rejects stale references.
 */
import { InteractiveElement } from '@agentctl/core';
export declare class ObservationTokenManager {
    private currentObservationId;
    private elementsByRef;
    createObservationId(): string;
    getCurrentObservationId(): string;
    registerElements(elements: InteractiveElement[]): void;
    /**
     * Validates target reference format and ensures it matches current observation.
     * Target reference must be formatted as: `obs_<hex>:<index>`
     */
    resolveAndValidateTarget(targetRef: string): InteractiveElement;
}
//# sourceMappingURL=observation_token.d.ts.map