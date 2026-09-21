/**
 * Playwright-backed Browser Provider: Atomic observations, observation token binding,
 * bounded action execution, and independent outcome verification.
 */

import {
  BrowserAction,
  BrowserActionResult,
  BrowserObservation,
  BrowserOutcomeResult,
  BrowserProvider,
  BrowserSessionInfo,
  BrowserSessionOptions,
  InteractiveElement,
  IrreversibleActionError,
  PolicyBlockedError,
  ProviderUnavailableError
} from '@agentctl/core';
import { BrowserSafety } from './safety.js';
import { SessionManager } from './session_manager.js';
import { DomExtractor } from './dom_extractor.js';

export class PlaywrightBrowserProvider implements BrowserProvider {
  public readonly id = 'browser:playwright';
  private sessionManager: SessionManager;

  constructor(idleTimeoutMs: number = 5 * 60 * 1000) {
    this.sessionManager = new SessionManager(idleTimeoutMs);
  }

  public async createSession(options?: BrowserSessionOptions): Promise<string> {
    const session = await this.sessionManager.createSession(options?.bounds);
    return session.sessionId;
  }

  public async closeSession(sessionId: string): Promise<void> {
    await this.sessionManager.closeSession(sessionId);
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
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new ProviderUnavailableError(this.id, `Session '${sessionId}' not found or expired`);
    }

    // SSRF & Origin Safety check
    BrowserSafety.validateUrl(
      url,
      session.bounds.allowedOrigins,
      session.bounds.allowPrivateNetworks
    );

    await session.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: session.bounds.timeoutMs ?? 15000
    });
  }

  public async observe(sessionId: string): Promise<BrowserObservation> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new ProviderUnavailableError(this.id, `Session '${sessionId}' not found or expired`);
    }

    const obsId = session.tokenManager.createObservationId();
    const script = DomExtractor.getExtractionScript(obsId);

    const rawElements: InteractiveElement[] = await session.page.evaluate(script);

    // Label elements that are potentially irreversible
    for (const el of rawElements) {
      el.isIrreversible = BrowserSafety.isIrreversible('click', el);
    }

    session.tokenManager.registerElements(rawElements);

    const summaryTable = DomExtractor.buildSummaryTable(rawElements);
    const title = await session.page.title().catch(() => '');
    const currentUrl = session.page.url();

    return {
      observationId: obsId,
      url: currentUrl,
      title,
      summaryTable,
      elements: rawElements,
      pageHealthScore: 1.0,
      anomalies: []
    };
  }

  public async act(
    sessionId: string,
    action: BrowserAction,
    targetOverride?: InteractiveElement
  ): Promise<BrowserActionResult> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new ProviderUnavailableError(this.id, `Session '${sessionId}' not found or expired`);
    }

    const start = Date.now();
    session.stepCount++;

    if (session.bounds.maxSteps && session.stepCount > session.bounds.maxSteps) {
      throw new PolicyBlockedError(
        `Session step budget exceeded (maxSteps: ${session.bounds.maxSteps})`
      );
    }

    let targetElement = targetOverride;
    if (!targetElement && action.targetRef) {
      // Validates target reference against current observation ID
      targetElement = session.tokenManager.resolveAndValidateTarget(action.targetRef);
    }

    const selector = targetElement ? `[data-fastpath-id="${targetElement.ref}"]` : undefined;

    switch (action.operation) {
      case 'click':
        if (!selector) throw new PolicyBlockedError('Click operation requires a targetRef');
        await session.page.click(selector, { timeout: 5000 });
        break;

      case 'type':
        if (!selector) throw new PolicyBlockedError('Type operation requires a targetRef');
        await session.page.fill(selector, action.textValue || '', { timeout: 5000 });
        break;

      case 'select':
        if (!selector) throw new PolicyBlockedError('Select operation requires a targetRef');
        if (action.selectOption) {
          await session.page.selectOption(selector, action.selectOption, { timeout: 5000 });
        }
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

    return {
      success: true,
      operation: action.operation,
      targetRef: action.targetRef,
      elapsedMs: Date.now() - start,
      details: `Executed ${action.operation}${action.targetRef ? ` on ${action.targetRef}` : ''}`
    };
  }

  public async checkOutcome(sessionId: string, assertion: string): Promise<BrowserOutcomeResult> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new ProviderUnavailableError(this.id, `Session '${sessionId}' not found or expired`);
    }

    // Inspect page text for assertion keywords
    const content = await session.page.innerText('body').catch(() => '');
    const hasMatch = assertion.toLowerCase().split(/\s+/).some((word) =>
      word.length > 3 && content.toLowerCase().includes(word)
    );

    return {
      satisfied: hasMatch,
      confidence: hasMatch ? 0.9 : 0.3,
      stepsExecuted: session.stepCount,
      details: hasMatch ? `Assertion text matches page content.` : `Assertion text was not found.`
    };
  }

  public async chooseAction(
    sessionId: string,
    goal: string
  ): Promise<{ action: BrowserAction; confidence: number }> {
    const observation = await this.observe(sessionId);
    if (observation.elements.length === 0) {
      return {
        action: { operation: 'wait' },
        confidence: 0.5
      };
    }

    // Pick top matching element for the goal
    const goalLower = goal.toLowerCase();
    const match = observation.elements.find((el) => {
      const label = el.label.toLowerCase();
      return goalLower.includes(label) || label.includes('submit') || label.includes('search');
    }) || observation.elements[0];

    const operation = match.tagName.toLowerCase() === 'input' ? 'type' : 'click';

    return {
      action: {
        operation,
        targetRef: match.ref,
        textValue: operation === 'type' ? 'test input' : undefined
      },
      confidence: 0.88
    };
  }

  public async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const sess = await this.createSession();
      await this.closeSession(sess);
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { healthy: false, latencyMs: Date.now() - start, error: err.message };
    }
  }
}
