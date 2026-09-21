/**
 * Browser Session Manager: Maintains bounded, isolated browser contexts
 * with automatic idle expiration and step budget enforcement.
 */
import { BrowserContext, Page } from 'playwright';
import { BrowserBounds } from '@agentctl/core';
import { ObservationTokenManager } from './observation_token.js';
export interface ActiveSession {
    sessionId: string;
    context: BrowserContext;
    page: Page;
    tokenManager: ObservationTokenManager;
    bounds: BrowserBounds;
    createdAt: number;
    lastUsedAt: number;
    stepCount: number;
    idleTimer?: NodeJS.Timeout;
}
export declare class SessionManager {
    private browser;
    private sessions;
    private idleTimeoutMs;
    constructor(idleTimeoutMs?: number);
    private ensureBrowser;
    createSession(bounds?: BrowserBounds): Promise<ActiveSession>;
    getSession(sessionId: string): ActiveSession | undefined;
    closeSession(sessionId: string): Promise<void>;
    closeAll(): Promise<void>;
    private resetIdleTimer;
}
//# sourceMappingURL=session_manager.d.ts.map