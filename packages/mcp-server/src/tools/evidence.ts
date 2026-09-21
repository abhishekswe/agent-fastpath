/**
 * MCP tool handlers for fastpath_evidence and fastpath_capabilities.
 */

import { z } from 'zod';
import {
  BrowserProvider,
  EscalationGate,
  FastpathCapabilitiesOutput,
  FastpathEvidenceOutput,
  FastpathServerConfig,
  JudgmentProvider,
  PRESET_REGISTRY,
  defaultEvidenceStore,
  effectiveRoots
} from '@agentctl/core';
import { VERSION } from '../version.js';

export const FastpathEvidenceShape = {
  traceId: z.string().describe('traceId from a previous fastpath response'),
  detailLevel: z
    .enum(['summary', 'full'])
    .optional()
    .default('summary')
    .describe('full adds the questions asked and diagnostics such as the gate result and policy.')
};

export const FastpathEvidenceSchema = z.object(FastpathEvidenceShape);

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
      diagnostics: { error: 'Trace ID not found. Traces are kept in memory for the last 500 calls.' }
    };
  }

  const full = args.detailLevel === 'full';
  return {
    traceId: trace.traceId,
    timestamp: trace.timestamp,
    tool: trace.tool,
    status: trace.status as FastpathEvidenceOutput['status'],
    decisionPath: trace.decisionPath,
    questions: full ? trace.questions : undefined,
    answers: trace.answers,
    rawDistributions: full ? trace.rawDistributions : undefined,
    latencyBreakdownMs: trace.latencyBreakdownMs,
    redactionsApplied: trace.redactionsApplied,
    diagnostics: full ? trace.diagnostics : undefined
  };
}

export function handleFastpathCapabilities(
  config: FastpathServerConfig,
  judgment: JudgmentProvider,
  browser: BrowserProvider
): FastpathCapabilitiesOutput {
  return {
    version: VERSION,
    providers: {
      judgment: { id: judgment.id, available: judgment.available, model: judgment.model },
      browser: { id: browser.id, available: true, headless: true },
      deterministic: { available: true }
    },
    presets: Object.keys(PRESET_REGISTRY),
    limits: {
      maxStateSizeBytes: config.maxStateSizeBytes,
      defaultConfidenceThreshold: EscalationGate.DEFAULT_CONFIDENCE_THRESHOLD,
      maxBrowserSteps: config.maxBrowserSteps,
      allowedFilesystemRoots: effectiveRoots(config),
      allowedBrowserOrigins: config.allowedOrigins,
      privateNetworksAllowed: config.allowPrivateNetworks
    },
    security: {
      ssrfProtectionEnabled: !config.allowPrivateNetworks,
      irreversibleActionGateEnabled: true,
      redactionEnabled: true
    }
  };
}
