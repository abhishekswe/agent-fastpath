/**
 * Browser Session Manager: isolated browser contexts with idle expiry, step budgets,
 * and a per-session egress proxy that enforces the network policy.
 */

import { randomBytes } from 'crypto';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { ProviderUnavailableError, SessionLimits } from '@agent-fastpath/core';
import { ObservationTokenManager } from './observation_token.js';
import { EgressProxy } from './egress_proxy.js';
import { LookupFn, systemLookup } from './network_policy.js';

export interface ActiveSession {
  sessionId: string;
  context: BrowserContext;
  page: Page;
  tokenManager: ObservationTokenManager;
  limits: SessionLimits;
  proxy?: EgressProxy;
  createdAt: number;
  lastUsedAt: number;
  stepCount: number;
  idleTimer?: NodeJS.Timeout;
}

export interface SessionManagerOptions {
  idleTimeoutMs?: number;
  /** DNS lookup used by the egress proxy. Injectable for tests. */
  lookup?: LookupFn;
}

export class SessionManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private sessions: Map<string, ActiveSession> = new Map();
  private readonly idleTimeoutMs: number;
  private readonly lookup: LookupFn;

  constructor(options: SessionManagerOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;
    this.lookup = options.lookup ?? systemLookup;
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (!this.launching) {
      // The Chromium sandbox stays on. Containers running as root can opt out explicitly.
      // WebRTC can send UDP around an HTTP proxy, so non-proxied UDP is disabled.
      const args = ['--disable-dev-shm-usage', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'];
      if (process.env.FASTPATH_BROWSER_NO_SANDBOX === '1') args.push('--no-sandbox');
      this.launching = chromium
        .launch({ headless: true, args })
        .then((b) => (this.browser = b))
        .catch((err) => {
          throw new ProviderUnavailableError(
            'browser:playwright',
            `${err.message.split('\n')[0]}. Run "npx playwright install chromium".`
          );
        })
        .finally(() => (this.launching = null));
    }
    return this.launching;
  }

  public async createSession(limits: SessionLimits): Promise<ActiveSession> {
    const browser = await this.ensureBrowser();
    const sessionId = `sess_${randomBytes(6).toString('hex')}`;

    let proxy: EgressProxy | undefined;
    let proxyConfig: { server: string; bypass: string } | undefined;
    if (!limits.allowPrivateNetworks) {
      proxy = new EgressProxy(false, this.lookup);
      // "<-loopback>" stops Chromium from silently bypassing the proxy for localhost.
      proxyConfig = { server: await proxy.start(), bypass: '<-loopback>' };
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'agent-fastpath',
      proxy: proxyConfig,
      acceptDownloads: false,
      serviceWorkers: 'block'
    });
    const page = await context.newPage();

    const session: ActiveSession = {
      sessionId,
      context,
      page,
      tokenManager: new ObservationTokenManager(),
      limits,
      proxy,
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

  public async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      if (session.idleTimer) clearTimeout(session.idleTimer);
      await session.context.close().catch(() => {});
      await session.proxy?.stop().catch(() => {});
    }

    if (this.sessions.size === 0 && this.browser) {
      const browser = this.browser;
      this.browser = null;
      await browser.close().catch(() => {});
    }
    return Boolean(session);
  }

  public async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.closeSession(id)));
    if (this.browser) {
      const browser = this.browser;
      this.browser = null;
      await browser.close().catch(() => {});
    }
  }

  private resetIdleTimer(session: ActiveSession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      void this.closeSession(session.sessionId).catch(() => {});
    }, this.idleTimeoutMs);
    session.idleTimer.unref();
  }
}
