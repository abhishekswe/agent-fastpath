/**
 * Cryptographic Observation Token Management:
 * Enforces that every interactive target reference is strictly bound
 * to a specific observation cycle and rejects stale references.
 */
import { randomBytes } from 'crypto';
import { StaleObservationError } from '@agentctl/core';
export class ObservationTokenManager {
    currentObservationId = '';
    elementsByRef = new Map();
    createObservationId() {
        this.currentObservationId = `obs_${randomBytes(6).toString('hex')}`;
        this.elementsByRef.clear();
        return this.currentObservationId;
    }
    getCurrentObservationId() {
        return this.currentObservationId;
    }
    registerElements(elements) {
        for (const el of elements) {
            this.elementsByRef.set(el.ref, el);
        }
    }
    /**
     * Validates target reference format and ensures it matches current observation.
     * Target reference must be formatted as: `obs_<hex>:<index>`
     */
    resolveAndValidateTarget(targetRef) {
        if (!targetRef || !targetRef.includes(':')) {
            throw new StaleObservationError(targetRef, this.currentObservationId, 'Invalid targetRef format. Expected "obs_<id>:<index>"');
        }
        const [obsId] = targetRef.split(':');
        if (obsId !== this.currentObservationId) {
            throw new StaleObservationError(targetRef, obsId, this.currentObservationId);
        }
        const element = this.elementsByRef.get(targetRef);
        if (!element) {
            throw new StaleObservationError(targetRef, this.currentObservationId, 'Element not found in current observation table');
        }
        if (element.disabled) {
            throw new StaleObservationError(targetRef, this.currentObservationId, 'Target element is disabled');
        }
        return element;
    }
}
//# sourceMappingURL=observation_token.js.map