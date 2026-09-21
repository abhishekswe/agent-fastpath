/**
 * Playwright-backed Browser Provider: Atomic observations, observation token binding,
 * bounded action execution, and independent outcome verification.
 */
import { BrowserAction, BrowserActionResult, BrowserObservation, BrowserOutcomeResult, BrowserProvider, BrowserSessionInfo, BrowserSessionOptions, InteractiveElement } from '@agentctl/core';
export declare class PlaywrightBrowserProvider implements BrowserProvider {
    readonly id = "browser:playwright";
    private sessionManager;
    constructor(idleTimeoutMs?: number);
    createSession(options?: BrowserSessionOptions): Promise<string>;
    closeSession(sessionId: string): Promise<void>;
    getSession(sessionId: string): BrowserSessionInfo | undefined;
    navigate(sessionId: string, url: string): Promise<void>;
    observe(sessionId: string): Promise<BrowserObservation>;
    act(sessionId: string, action: BrowserAction, targetOverride?: InteractiveElement): Promise<BrowserActionResult>;
    checkOutcome(sessionId: string, assertion: string): Promise<BrowserOutcomeResult>;
    chooseAction(sessionId: string, goal: string): Promise<{
        action: BrowserAction;
        confidence: number;
    }>;
    checkHealth(): Promise<{
        healthy: boolean;
        latencyMs: number;
        error?: string;
    }>;
}
//# sourceMappingURL=provider.d.ts.map