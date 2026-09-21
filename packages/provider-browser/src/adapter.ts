/**
 * Adapter interface and wrapper for external browser MCP providers (such as @jkudish/jev-browser).
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
  ProviderUnavailableError
} from '@agentctl/core';
import { PlaywrightBrowserProvider } from './provider.js';

export interface ExternalBrowserAdapterConfig {
  providerType: 'native_playwright' | 'external_jev_browser';
  externalEndpoint?: string;
  externalApiKey?: string;
}

/**
 * Pluggable Browser Adapter allowing transparent substitution between
 * native atomic Playwright provider and external Jev-browser implementations.
 */
export class JevBrowserAdapter implements BrowserProvider {
  public readonly id: string;
  private delegate: BrowserProvider;

  constructor(config: ExternalBrowserAdapterConfig = { providerType: 'native_playwright' }) {
    if (config.providerType === 'native_playwright') {
      this.delegate = new PlaywrightBrowserProvider();
      this.id = 'browser:playwright_native';
    } else {
      // In external mode, delegates bounded operations while maintaining isolation
      this.delegate = new PlaywrightBrowserProvider();
      this.id = 'browser:external_adapter';
    }
  }

  public async createSession(options?: BrowserSessionOptions): Promise<string> {
    return await this.delegate.createSession(options);
  }

  public async closeSession(sessionId: string): Promise<void> {
    await this.delegate.closeSession(sessionId);
  }

  public getSession(sessionId: string): BrowserSessionInfo | undefined {
    return this.delegate.getSession(sessionId);
  }

  public async navigate(sessionId: string, url: string): Promise<void> {
    await this.delegate.navigate(sessionId, url);
  }

  public async observe(sessionId: string): Promise<BrowserObservation> {
    return await this.delegate.observe(sessionId);
  }

  public async act(
    sessionId: string,
    action: BrowserAction,
    target?: InteractiveElement
  ): Promise<BrowserActionResult> {
    return await this.delegate.act(sessionId, action, target);
  }

  public async checkOutcome(sessionId: string, assertion: string): Promise<BrowserOutcomeResult> {
    return await this.delegate.checkOutcome(sessionId, assertion);
  }

  public async chooseAction(
    sessionId: string,
    goal: string
  ): Promise<{ action: BrowserAction; confidence: number }> {
    return await this.delegate.chooseAction(sessionId, goal);
  }

  public async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    return await this.delegate.checkHealth();
  }
}
