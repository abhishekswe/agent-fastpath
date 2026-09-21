/**
 * Browser Safety Controls: SSRF prevention, private network isolation,
 * and irreversible action protection.
 */
import { InteractiveElement } from '@agentctl/core';
export declare class BrowserSafety {
    private static readonly PRIVATE_IP_PATTERNS;
    /**
     * Validates target URL against SSRF and origin policy rules.
     */
    static validateUrl(targetUrl: string, allowedOrigins?: string[], allowPrivateNetworks?: boolean): void;
    /**
     * Checks if an action on a target element is potentially irreversible or high-risk.
     */
    static isIrreversible(operation: string, element?: InteractiveElement): boolean;
}
//# sourceMappingURL=safety.d.ts.map