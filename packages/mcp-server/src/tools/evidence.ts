/**
 * MCP tool handlers for fastpath_evidence and fastpath_capabilities.
 */

import { z } from 'zod';
import {
  defaultEvidenceStore,
  FastpathCapabilitiesOutput,
  FastpathEvidenceInput,
  FastpathEvidenceOutput,
  PRESET_REGISTRY
} from '@agentctl/core';

export const FastpathEvidenceSchema = z.object({
  traceId: z.string().describe('Opaque trace identifier returned from a previous fastpath operation'),
  detailLevel: z.enum(['summary', 'full']).optional().default('summary').describe('Detail level for diagnostics')
});

export async function handleFastpathEvidence(
  args: z.infer<typeof FastpathEvidenceSchema>
): Promise<FastpathEvidenceOutput> {
  const trace = await defaultEvidenceStore.getTrace(args.traceId);
  if (!trace) {
    return {
      traceId: args.traceId,
      timestamp: new Date().toISOString(),
      tool: 'unknown',
      status: 'error',
      decisionPath: 'unknown',
      latencyBreakdownMs: {},
      redactionsApplied: [],
      diagnostics: { error: 'Trace ID not found or expired from ring buffer.' }
    };
  }

  return {
    traceId: trace.traceId,
    timestamp: trace.timestamp,
    tool: trace.tool,
    status: trace.status as any,
    decisionPath: trace.decisionPath,
    questions: args.detailLevel === 'full' ? trace.questions : undefined,
    answers: trace.answers,
    rawDistributions: args.detailLevel === 'full' ? trace.rawDistributions : undefined,
    latencyBreakdownMs: trace.latencyBreakdownMs,
    redactionsApplied: trace.redactionsApplied,
    diagnostics: trace.diagnostics
  };
}

export const FastpathCapabilitiesSchema = z.object({});

export function handleFastpathCapabilities(): FastpathCapabilitiesOutput {
  return {
    version: '0.1.0',
    providers: {
      judgment: {
        id: 'typesafe',
        available: Boolean(process.env.TYPESAFE_API_KEY),
        model: 'jev-latest'
      },
      browser: {
        id: 'playwright',
        available: true,
        headless: true
      },
      deterministic: {
        available: true
      }
    },
    presets: Object.keys(PRESET_REGISTRY),
    limits: {
      maxStateSizeBytes: 256 * 1024,
      defaultConfidenceThreshold: 0.75,
      maxBrowserSteps: 5,
      allowedFilesystemRoots: [process.cwd()],
      allowedBrowserOrigins: ['*']
    },
    security: {
      ssrfProtectionEnabled: true,
      irreversibleActionGateEnabled: true,
      redactionEnabled: true
    }
  };
}
