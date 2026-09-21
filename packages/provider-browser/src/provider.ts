/**
 * Playwright-backed Browser Provider: atomic observations, observation token binding,
 * bounded actions, and deterministic outcome checks.
 */

import { Page } from 'playwright';
import {
  BrowserAction,
  BrowserActionResult,
  BrowserActOptions,
  BrowserObservation,
  BrowserOutcomeResult,
  BrowserProvider,
  BrowserSessionInfo,
  BrowserSessionOptions,
  InteractiveElement,
  IrreversibleActionError,
  PolicyBlockedError,
  ProviderUnavailableError,
  SSRFBlockedError
} from '@agentctl/core';
import { BrowserSafety } from './safety.js';
import { ActiveSession, SessionManager, SessionManagerOptions } from './session_manager.js';
import { DomExtractor } from './dom_extractor.js';
import { assertNavigationAllowed, isOriginAllowed, LookupFn, systemLookup } from './network_policy.js';

/** Most elements returned per observation; larger pages report the overflow as an anomaly. */
const MAX_ELEMENTS = 60;
/** How long to wait for an action to start a navigation before treating it as in-page. */
const NAVIGATION_GRACE_MS = 500;

export class PlaywrightBrowserProvider implements BrowserProvider {
  public readonly id = 'browser:playwright';
  private readonly sessionManager: SessionManager;
  private readonly lookup: LookupFn;

  constructor(options: SessionManagerOptions = {}) {
    this.sessionManager = new SessionManager(options);
    this.lookup = options.lookup ?? systemLookup;
  }

  public async createSession(options: BrowserSessionOptions): Promise<string> {
    const session = await this.sessionManager.createSession(options.limits);
    return session.sessionId;
  }

  public async closeSession(sessionId: string): Promise<void> {
    await this.sessionManager.closeSession(sessionId);
  }

  public async closeAll(): Promise<void> {
    await this.sessionManager.closeAll();
  }

  public getSession(sessionId: string): BrowserSessionInfo | undefined {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return undefined;
    return {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      currentUrl: session.page.url(),
      title: ''
    };
  }

  public async navigate(sessionId: string, url: string): Promise<void> {
    const session = this.require(sessionId);
    await assertNavigationAllowed(url, session.limits, this.lookup);
    try {
      await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: session.limits.timeoutMs });
    } catch (err: any) {
      this.rethrowIfBlocked(session, url, err);
      throw err;
    }
    await this.assertCurrentOriginAllowed(session);
  }

  public async observe(sessionId: string): Promise<BrowserObservation> {
    const session = this.require(sessionId);
    const obsId = session.tokenManager.createObservationId();

    const all: InteractiveElement[] = await session.page.evaluate(DomExtractor.getExtractionScript(obsId));
    const elements = all.slice(0, MAX_ELEMENTS);
    for (const el of elements) {
      el.isIrreversible = BrowserSafety.isIrreversible('click', el);
    }
    session.tokenManager.registerElements(elements);

    const anomalies: string[] = [];
    if (all.length > elements.length) {
      anomalies.push(`Showing ${elements.length} of ${all.length} interactive elements. Scroll to see more.`);
    }
    for (const b of session.proxy?.drainBlocked() ?? []) {
      anomalies.push(`Blocked request to ${b.target}: ${b.reason}`);
    }

    const html = await session.page.content().catch(() => '');
    return {
      observationId: obsId,
      url: session.page.url(),
      title: await session.page.title().catch(() => ''),
      summaryTable: DomExtractor.buildSummaryTable(elements),
      elements,
      pageHealthScore: anomalies.some((a) => a.startsWith('Blocked')) ? 0.8 : 1.0,
      anomalies,
      rawHtmlBytes: Buffer.byteLength(html, 'utf8')
    };
  }

  public async act(
    sessionId: string,
    action: BrowserAction,
    options: BrowserActOptions = {}
  ): Promise<BrowserActionResult> {
    const session = this.require(sessionId);
    const start = Date.now();

    if (session.stepCount >= session.limits.maxSteps) {
      throw new PolicyBlockedError(`Session step budget exceeded (maxSteps: ${session.limits.maxSteps})`);
    }

    const target = action.targetRef ? session.tokenManager.resolveAndValidateTarget(action.targetRef) : undefined;
    if (target && BrowserSafety.isIrreversible(action.operation, target) && !options.allowIrreversible) {
      throw new IrreversibleActionError(`${action.operation} "${target.label}"`);
    }

    session.stepCount++;
    const selector = target ? `[data-fastpath-id="${target.ref}"]` : undefined;
    const needTarget = (op: string) => {
      if (!selector) throw new PolicyBlockedError(`${op} operation requires a targetRef`);
      return selector;
    };

    await this.settleAfter(session.page, async () => {
      switch (action.operation) {
        case 'click':
          await session.page.click(needTarget('Click'), { timeout: 5000 });
          break;
        case 'type':
          await session.page.fill(needTarget('Type'), action.textValue ?? '', { timeout: 5000 });
          break;
        case 'select':
          if (!action.selectOption) throw new PolicyBlockedError('Select operation requires selectOption');
          await session.page.selectOption(needTarget('Select'), action.selectOption, { timeout: 5000 });
          break;
        case 'scroll_down':
          await session.page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.75));
          break;
        case 'scroll_up':
          await session.page.evaluate(() => window.scrollBy(0, -window.innerHeight * 0.75));
          break;
        case 'wait':
          await session.page.waitForTimeout(500);
          break;
        default:
          throw new PolicyBlockedError(`Unsupported browser operation: ${action.operation}`);
      }
    });
    await this.assertCurrentOriginAllowed(session);

    return {
      success: true,
      operation: action.operation,
      targetRef: action.targetRef,
      elapsedMs: Date.now() - start,
      details: `Executed ${action.operation}${target ? ` on "${target.label}" (${action.targetRef})` : ''}`
    };
  }

  public async checkOutcome(sessionId: string, assertion: string): Promise<BrowserOutcomeResult> {
    const session = this.require(sessionId);
    const content = normalizeText(await session.page.innerText('body').catch(() => ''));
    const phrase = normalizeText(assertion);
    const satisfied = phrase.length > 0 && content.includes(phrase);

    return {
      satisfied,
      confidence: satisfied ? 0.95 : 0,
      stepsExecuted: session.stepCount,
      details: satisfied ? 'Assertion phrase found in page text.' : 'Assertion phrase not found verbatim.'
    };
  }

  public async readPageText(sessionId: string, maxChars: number): Promise<string> {
    const session = this.require(sessionId);
    const text = await session.page.innerText('body').catch(() => '');
    return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
  }

  public async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const sess = await this.createSession({
        limits: { maxSteps: 1, timeoutMs: 5000, allowedOrigins: [], allowPrivateNetworks: false }
      });
      await this.closeSession(sess);
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  private require(sessionId: string): ActiveSession {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new ProviderUnavailableError(this.id, `Session '${sessionId}' not found or expired`);
    }
    return session;
  }

  /**
   * Runs an action, then waits for any navigation it started to reach DOMContentLoaded,
   * so the next observation sees the new page rather than a half-loaded one.
   */
  private async settleAfter(page: Page, run: () => Promise<void>): Promise<void> {
    let navigated = false;
    const onNav = (frame: unknown) => {
      if (frame === page.mainFrame()) navigated = true;
    };
    page.on('framenavigated', onNav);
    try {
      await run();
      if (!navigated) await page.waitForTimeout(NAVIGATION_GRACE_MS);
      if (navigated) await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    } finally {
      page.off('framenavigated', onNav);
    }
  }

  /** Redirects and clicks can leave the allowlist; stop there rather than keep browsing. */
  private async assertCurrentOriginAllowed(session: ActiveSession): Promise<void> {
    const current = session.page.url();
    if (current === 'about:blank') return;
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return;
    }
    if (parsed.protocol === 'chrome-error:') return;
    if (!isOriginAllowed(parsed, session.limits.allowedOrigins)) {
      await session.page.goto('about:blank').catch(() => {});
      throw new SSRFBlockedError(current, `Navigation left the allowed origins: ${session.limits.allowedOrigins.join(', ')}`);
    }
  }

  /** A navigation refused by the egress proxy surfaces as a tunnel/connection error. */
  private rethrowIfBlocked(session: ActiveSession, url: string, err: any): void {
    const blocked = session.proxy?.drainBlocked() ?? [];
    if (blocked.length > 0) {
      throw new SSRFBlockedError(url, blocked[0].reason);
    }
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED/.test(String(err?.message))) {
      throw new SSRFBlockedError(url, 'Connection refused by egress policy');
    }
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
