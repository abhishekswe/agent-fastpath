/**
 * Cryptographic Observation Token Management:
 * Enforces that every interactive target reference is strictly bound
 * to a specific observation cycle and rejects stale references.
 */

import { randomBytes } from 'crypto';
import { InteractiveElement, StaleObservationError } from '@agent-fastpath/core';

export class ObservationTokenManager {
  private currentObservationId: string = '';
  private elementsByRef: Map<string, InteractiveElement> = new Map();

  public createObservationId(): string {
    this.currentObservationId = `obs_${randomBytes(6).toString('hex')}`;
    this.elementsByRef.clear();
    return this.currentObservationId;
  }

  public getCurrentObservationId(): string {
    return this.currentObservationId;
  }

  public registerElements(elements: InteractiveElement[]): void {
    for (const el of elements) {
      this.elementsByRef.set(el.ref, el);
    }
  }

  /**
   * Validates target reference format and ensures it matches current observation.
   * Target reference must be formatted as: `obs_<hex>:<index>`
   */
  public resolveAndValidateTarget(targetRef: string): InteractiveElement {
    const current = this.currentObservationId;
    const match = /^(obs_[0-9a-f]+):(\d+)$/.exec(targetRef ?? '');
    if (!match) {
      throw new StaleObservationError(targetRef, '', current, 'expected format "obs_<id>:<index>"');
    }
    if (match[1] !== current) {
      throw new StaleObservationError(targetRef, match[1], current);
    }

    const element = this.elementsByRef.get(targetRef);
    if (!element) {
      throw new StaleObservationError(targetRef, match[1], current, 'no such element in the current observation');
    }
    if (element.disabled) {
      throw new StaleObservationError(targetRef, match[1], current, 'element is disabled');
    }
    return element;
  }
}
