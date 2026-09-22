/**
 * Browser action safety: flags actions that are hard to undo.
 * Network safety (SSRF, origin allowlists) lives in network_policy.ts and egress_proxy.ts.
 */

import { InteractiveElement } from '@agent-fastpath/core';

// Word-bounded so "Dropdown" and "Display" are not flagged.
const IRREVERSIBLE_LABEL =
  /\b(delete|destroy|remove|drop|erase|wipe|purge|buy|buy now|purchase|place order|submit order|confirm order|pay|pay now|confirm payment|checkout|check out|transfer|send money|unsubscribe|cancel subscription|close account|deactivate|terminate|revoke|publish|deploy|merge)\b/i;

export class BrowserSafety {
  /**
   * True when acting on the element is likely irreversible (deletes, payments, publishing).
   * Only click-like operations can trigger these; typing into a field cannot.
   */
  public static isIrreversible(operation: string, element?: InteractiveElement): boolean {
    if (!element) return false;
    if (operation !== 'click' && operation !== 'select') return false;
    return IRREVERSIBLE_LABEL.test(element.label || '');
  }
}
