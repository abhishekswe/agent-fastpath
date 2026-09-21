/**
 * Browser Session Manager: Maintains bounded, isolated browser contexts
 * with automatic idle expiration and step budget enforcement.
 */

import { randomBytes } from 'crypto';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { BrowserBounds, BrowserSessionInfo } from '@agentctl/core';
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

export class SessionManager {
  private browser: Browser | null = null;
  private sessions: Map<string, ActiveSession> = new Map();
  private idleTimeoutMs: number;

  constructor(idleTimeoutMs: number = 5 * 60 * 1000) {
    this.idleTimeoutMs = idleTimeoutMs;
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox']
      });
    }
    return this.browser;
  }

  public async createSession(bounds: BrowserBounds = {}): Promise<ActiveSession> {
    const browser = await this.ensureBrowser();
    const sessionId = `sess_${randomBytes(6).toString('hex')}`;

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'agentctl-fastpath/0.1.0'
    });

    const page = await context.newPage();
    const tokenManager = new ObservationTokenManager();

    const session: ActiveSession = {
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

  public getSession(sessionId: string): ActiveSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastUsedAt = Date.now();
      this.resetIdleTimer(session);
    }
    return session;
  }

  public async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
      await session.page.close().catch(() => {});
      await session.context.close().catch(() => {});
      this.sessions.delete(sessionId);
    }

    if (this.sessions.size === 0 && this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  public async closeAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.closeSession(id);
    }
  }

  private resetIdleTimer(session: ActiveSession): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }
    session.idleTimer = setTimeout(async () => {
      await this.closeSession(session.sessionId).catch(() => {});
    }, this.idleTimeoutMs);
  }
}
