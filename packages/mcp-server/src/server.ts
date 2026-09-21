/**
 * Transport-independent MCP server for agentctl-fastpath.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  BrowserProvider,
  CapabilityRouter,
  FastpathError,
  FastpathServerConfig,
  JudgmentProvider,
  effectiveRoots,
  resolveServerConfig
} from '@agentctl/core';
import {
  MockTypeSafeProvider,
  TypeSafeJudgmentProvider,
  UnavailableJudgmentProvider
} from '@agentctl/provider-typesafe';
import { PlaywrightBrowserProvider } from '@agentctl/provider-browser';

import { FastpathEvaluateShape, handleFastpathEvaluate } from './tools/evaluate.js';
import { FastpathTriageShape, handleFastpathTriage } from './tools/triage.js';
import { FastpathBrowserShape, handleFastpathBrowser } from './tools/browser.js';
import { FastpathEvidenceShape, handleFastpathEvidence, handleFastpathCapabilities } from './tools/evidence.js';
import { VERSION } from './version.js';

export interface FastpathServerOptions {
  judgmentProvider?: JudgmentProvider;
  browserProvider?: BrowserProvider;
  /** Overrides for the operator config. Unset fields come from environment variables. */
  config?: Partial<FastpathServerConfig>;
  env?: NodeJS.ProcessEnv;
}

/**
 * Picks the judgment provider from the environment. Without an API key semantic questions
 * escalate to the host; the keyword mock is used only when explicitly requested.
 */
export function createJudgmentProvider(env: NodeJS.ProcessEnv = process.env): JudgmentProvider {
  if (env.FASTPATH_JUDGMENT === 'mock') return new MockTypeSafeProvider();
  if (env.TYPESAFE_API_KEY) return new TypeSafeJudgmentProvider({ apiKey: env.TYPESAFE_API_KEY });
  return new UnavailableJudgmentProvider();
}

export class FastpathMcpServer {
  private readonly server: McpServer;
  private readonly router: CapabilityRouter;
  private readonly browserProvider: BrowserProvider;
  private readonly judgmentProvider: JudgmentProvider;
  private readonly config: FastpathServerConfig;

  constructor(options: FastpathServerOptions = {}) {
    const env = options.env ?? process.env;
    this.config = resolveServerConfig(options.config, env);
    this.judgmentProvider = options.judgmentProvider ?? createJudgmentProvider(env);
    // Providers are lazy: no browser or network connection starts until a tool needs one.
    this.browserProvider = options.browserProvider ?? new PlaywrightBrowserProvider();
    this.router = new CapabilityRouter({
      judgmentProvider: this.judgmentProvider,
      maxStateSizeBytes: this.config.maxStateSizeBytes
    });

    this.server = new McpServer({ name: 'agentctl-fastpath', version: VERSION }, { capabilities: { tools: {} } });
    this.registerTools();
  }

  public getMcpServer(): McpServer {
    return this.server;
  }

  public getRouter(): CapabilityRouter {
    return this.router;
  }

  public getBrowserProvider(): BrowserProvider {
    return this.browserProvider;
  }

  public getConfig(): FastpathServerConfig {
    return this.config;
  }

  /** Closes browser sessions. Call on shutdown. */
  public async close(): Promise<void> {
    await this.browserProvider.closeAll();
    await this.server.close().catch(() => {});
  }

  private registerTools(): void {
    this.server.registerTool(
      'fastpath_evaluate',
      {
        description:
          'Answer typed questions about a piece of text in one fast call: a choice, a 0-based score, or a yes/no probability. ' +
          'Use a preset (ship_gate, risk, severity, ambiguity, relevance, verify_claim, classify, intent, rank, compare, extract_fields) ' +
          'or your own questions. Returns status accept/review/escalate: act on accept, inspect on review, decide yourself or ask the user on escalate.',
        inputSchema: FastpathEvaluateShape
      },
      (args) => this.run(() => handleFastpathEvaluate(this.router, args))
    );

    this.server.registerTool(
      'fastpath_triage',
      {
        description:
          'Rank files or text items by relevance to a query without reading them into your context. ' +
          'Pass file paths; the server reads them (within its allowed roots) and returns the top items with short snippets.',
        inputSchema: FastpathTriageShape
      },
      (args) => this.run(() => handleFastpathTriage(this.router, args, effectiveRoots(this.config)))
    );

    this.server.registerTool(
      'fastpath_browser',
      {
        description:
          'Drive a headless browser one bounded step at a time and get a compact element table instead of screenshots or HTML. ' +
          'Target elements with refs from the latest observation (obs_<id>:<n>). Irreversible actions need allowIrreversible after user confirmation. ' +
          'Private and loopback addresses are blocked. Close the session when done.',
        inputSchema: FastpathBrowserShape
      },
      (args) =>
        this.run(() =>
          handleFastpathBrowser(
            { browser: this.browserProvider, router: this.router, config: this.config },
            args
          )
        )
    );

    this.server.registerTool(
      'fastpath_evidence',
      {
        description: 'Explain a previous result: the questions asked, full answers, gate decision, and policy, by traceId.',
        inputSchema: FastpathEvidenceShape
      },
      (args) => this.run(() => handleFastpathEvidence(args))
    );

    this.server.registerTool(
      'fastpath_capabilities',
      {
        description: 'Report the active providers, presets, limits, and security settings. Never includes secrets.'
      },
      () => this.run(async () => handleFastpathCapabilities(this.config, this.judgmentProvider, this.browserProvider))
    );
  }

  private async run(fn: () => Promise<unknown>): Promise<CallToolResult> {
    try {
      const result = await fn();
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err: any) {
      const payload = {
        status: err instanceof FastpathError ? err.status : 'error',
        errorCode: err?.code ?? 'EXECUTION_ERROR',
        message: err?.message ?? String(err),
        details: err?.details
      };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  }
}
