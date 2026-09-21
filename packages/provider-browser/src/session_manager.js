/**
 * Browser Session Manager: Maintains bounded, isolated browser contexts
 * with automatic idle expiration and step budget enforcement.
 */
import { randomBytes } from 'crypto';
import { chromium } from 'playwright';
import { ObservationTokenManager } from './observation_token.js';
export class SessionManager {
    browser = null;
    sessions = new Map();
    idleTimeoutMs;
    constructor(idleTimeoutMs = 5 * 60 * 1000) {
        this.idleTimeoutMs = idleTimeoutMs;
    }
    async ensureBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            this.browser = await chromium.launch({
                headless: true,
                args: ['--disable-dev-shm-usage', '--no-sandbox']
            });
        }
        return this.browser;
    }
    async createSession(bounds = {}) {
        const browser = await this.ensureBrowser();
        const sessionId = `sess_${randomBytes(6).toString('hex')}`;
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'agentctl-fastpath/0.1.0'
        });
        const page = await context.newPage();
        const tokenManager = new ObservationTokenManager();
        const session = {
            sessionId,
            context,
            page,
            tokenManager,
            bounds,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            stepCount: 0
        };
        this.resetIdleTimer(session);
        this.sessions.set(sessionId, session);
        return session;
    }
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastUsedAt = Date.now();
            this.resetIdleTimer(session);
        }
        return session;
    }
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            if (session.idleTimer)
                clearTimeout(session.idleTimer);
            await session.page.close().catch(() => { });
            await session.context.close().catch(() => { });
            this.sessions.delete(sessionId);
        }
        if (this.sessions.size === 0 && this.browser) {
            await this.browser.close().catch(() => { });
            this.browser = null;
        }
    }
    async closeAll() {
        const ids = Array.from(this.sessions.keys());
        for (const id of ids) {
            await this.closeSession(id);
        }
    }
    resetIdleTimer(session) {
        if (session.idleTimer) {
            clearTimeout(session.idleTimer);
        }
        session.idleTimer = setTimeout(async () => {
            await this.closeSession(session.sessionId).catch(() => { });
        }, this.idleTimeoutMs);
    }
}
//# sourceMappingURL=session_manager.js.map