/**
 * Transport-independent MCP Server implementation for agentctl-fastpath.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {
  BrowserProvider,
  CapabilityRouter,
  FastpathError,
  JudgmentProvider
} from '@agentctl/core';
import { TypeSafeJudgmentProvider, MockTypeSafeProvider } from '@agentctl/provider-typesafe';
import { PlaywrightBrowserProvider } from '@agentctl/provider-browser';

import { FastpathEvaluateSchema, handleFastpathEvaluate } from './tools/evaluate.js';
import { FastpathTriageSchema, handleFastpathTriage } from './tools/triage.js';
import { FastpathBrowserSchema, handleFastpathBrowser } from './tools/browser.js';
import {
  FastpathEvidenceSchema,
  handleFastpathEvidence,
  handleFastpathCapabilities
} from './tools/evidence.js';

export interface FastpathServerOptions {
  judgmentProvider?: JudgmentProvider;
  browserProvider?: BrowserProvider;
  router?: CapabilityRouter;
}

export class FastpathMcpServer {
  private server: Server;
  private router: CapabilityRouter;
  private browserProvider: BrowserProvider;
  private judgmentProvider: JudgmentProvider;

  constructor(options: FastpathServerOptions = {}) {
    // Lazy-initialize providers; do NOT start browsers or network connections at construction/import
    this.judgmentProvider =
      options.judgmentProvider ||
      (process.env.TYPESAFE_API_KEY
        ? new TypeSafeJudgmentProvider()
        : new MockTypeSafeProvider());

    this.browserProvider = options.browserProvider || new PlaywrightBrowserProvider();
    this.router = options.router || new CapabilityRouter({ judgmentProvider: this.judgmentProvider });

    this.server = new Server(
      {
        name: 'agentctl-fastpath',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  public getMcpServer(): Server {
    return this.server;
  }

  public getRouter(): CapabilityRouter {
    return this.router;
  }

  public getBrowserProvider(): BrowserProvider {
    return this.browserProvider;
  }

  private setupHandlers(): void {
    // 1. Tool discovery: advertise exactly 5 compact tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'fastpath_evaluate',
            description:
              'Run fast typed semantic evaluation (choice/score/noul or presets like relevance, ship_gate, risk) over state without conversational overhead.',
            inputSchema: {
              type: 'object',
              properties: {
                state: {
                  description: 'Context string or structured JSON to evaluate'
                },
                questions: {
                  type: 'object',
                  description: 'Map of typed questions (choice, score, noul)'
                },
                preset: {
                  type: 'string',
                  enum: [
                    'relevance',
                    'rank',
                    'classify',
                    'verify_claim',
                    'extract_fields',
                    'compare',
                    'severity',
                    'ambiguity',
                    'intent',
                    'risk',
                    'ship_gate'
                  ],
                  description: 'Validated preset name'
                },
                presetParams: { type: 'object' },
                policy: { type: 'object' },
                deadlineMs: { type: 'number' }
              },
              required: ['state']
            }
          },
          {
            name: 'fastpath_triage',
            description:
              'Rank or filter files or items against a query without putting all full contents into the host LLM context.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query or criterion' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      content: { type: 'string' },
                      path: { type: 'string' }
                    },
                    required: ['id']
                  },
                  description: 'Items with content or allowed file paths'
                },
                limit: { type: 'number', description: 'Maximum top results to return' },
                allowedRoots: { type: 'array', items: { type: 'string' } }
              },
              required: ['query', 'items']
            }
          },
          {
            name: 'fastpath_browser',
            description:
              'Perform one bounded browser operation (open, observe, act, check, choose, run_bounded). Returns compact observations with verified element tokens.',
            inputSchema: {
              type: 'object',
              properties: {
                mode: {
                  type: 'string',
                  enum: ['open', 'observe', 'act', 'check', 'choose', 'run_bounded']
                },
                sessionId: { type: 'string' },
                url: { type: 'string' },
                action: {
                  type: 'object',
                  properties: {
                    operation: {
                      type: 'string',
                      enum: ['click', 'type', 'select', 'scroll_down', 'scroll_up', 'wait']
                    },
                    targetRef: { type: 'string' },
                    textValue: { type: 'string' },
                    selectOption: { type: 'string' }
                  },
                  required: ['operation']
                },
                goal: { type: 'string' },
                assertion: { type: 'string' },
                allowIrreversible: { type: 'boolean' },
                bounds: { type: 'object' }
              },
              required: ['mode']
            }
          },
          {
            name: 'fastpath_evidence',
            description:
              'Retrieve expanded evidence, question breakdowns, and raw probability distributions for a previous traceId.',
            inputSchema: {
              type: 'object',
              properties: {
                traceId: { type: 'string', description: 'Trace ID from a previous response' },
                detailLevel: { type: 'string', enum: ['summary', 'full'] }
              },
              required: ['traceId']
            }
          },
          {
            name: 'fastpath_capabilities',
            description:
              'Report active providers, limits, presets, and security settings without exposing secrets.',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    // 2. Tool Execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        let result: unknown;

        switch (name) {
          case 'fastpath_evaluate': {
            const parsed = FastpathEvaluateSchema.parse(args);
            result = await handleFastpathEvaluate(this.router, parsed);
            break;
          }

          case 'fastpath_triage': {
            const parsed = FastpathTriageSchema.parse(args);
            result = await handleFastpathTriage(this.router, parsed);
            break;
          }

          case 'fastpath_browser': {
            const parsed = FastpathBrowserSchema.parse(args);
            result = await handleFastpathBrowser(this.browserProvider, parsed);
            break;
          }

          case 'fastpath_evidence': {
            const parsed = FastpathEvidenceSchema.parse(args);
            result = await handleFastpathEvidence(parsed);
            break;
          }

          case 'fastpath_capabilities': {
            result = handleFastpathCapabilities();
            break;
          }

          default:
            throw new FastpathError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL', 'error');
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: err instanceof FastpathError ? err.status : 'error',
                errorCode: err.code || 'EXECUTION_ERROR',
                message: err.message || String(err),
                details: err.details
              })
            }
          ]
        };
      }
    });
  }
}
