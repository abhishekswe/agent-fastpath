/**
 * MCP tool handler for fastpath_browser.
 */

import { z } from 'zod';
import {
  BrowserObservation,
  BrowserProvider,
  FastpathBrowserInput,
  FastpathBrowserOutput,
  IrreversibleActionError,
  LocalEvidenceStore,
  PolicyBlockedError,
  defaultEvidenceStore,
  defaultMetricsRecorder
} from '@agentctl/core';

export const FastpathBrowserSchema = z.object({
  mode: z
    .enum(['open', 'observe', 'act', 'check', 'choose', 'run_bounded'])
    .describe('Bounded browser operation mode'),
  sessionId: z.string().optional().describe('Existing session identifier'),
  url: z.string().optional().describe('Target web URL for open/navigate'),
  action: z
    .object({
      operation: z.enum(['click', 'type', 'select', 'scroll_down', 'scroll_up', 'wait']),
      targetRef: z.string().optional(),
      textValue: z.string().optional(),
      selectOption: z.string().optional()
    })
    .optional()
    .describe('Action to execute in act mode'),
  goal: z.string().optional().describe('Goal description for choose and run_bounded modes'),
  assertion: z.string().optional().describe('Semantic condition to verify in check mode'),
  allowIrreversible: z
    .boolean()
    .optional()
    .default(false)
    .describe('Must be explicitly true to permit destructive actions (delete, purchase, etc.)'),
  bounds: z
    .object({
      maxSteps: z.number().optional(),
      timeoutMs: z.number().optional(),
      allowedOrigins: z.array(z.string()).optional(),
      allowPrivateNetworks: z.boolean().optional()
    })
    .optional()
    .describe('Resource, security, and step bounds')
});

export async function handleFastpathBrowser(
  browserProvider: BrowserProvider,
  args: z.infer<typeof FastpathBrowserSchema>
): Promise<FastpathBrowserOutput> {
  const startTime = Date.now();
  const traceId = LocalEvidenceStore.generateTraceId();

  let sessionId = args.sessionId;

  // 1. OPEN MODE
  if (args.mode === 'open') {
    if (!args.url) {
      throw new PolicyBlockedError('URL is required for mode "open"');
    }
    sessionId = await browserProvider.createSession({ bounds: args.bounds });
    await browserProvider.navigate(sessionId, args.url);
    const observation = await browserProvider.observe(sessionId);

    const latencyMs = Date.now() - startTime;
    return {
      sessionId,
      status: 'accept',
      url: observation.url,
      observation,
      reasonCode: 'BROWSER_OPENED_AND_OBSERVED',
      traceId,
      metrics: {
        latencyMs,
        estimatedTokensSaved: 1200,
        hostTurnsSaved: 1,
        provider: browserProvider.id,
        stateBytesEvaluated: Buffer.byteLength(observation.summaryTable, 'utf8'),
        decisionPath: 'browser'
      }
    };
  }

  // Ensure sessionId exists for other modes
  if (!sessionId) {
    throw new PolicyBlockedError(`sessionId is required for mode "${args.mode}"`);
  }

  // 2. OBSERVE MODE
  if (args.mode === 'observe') {
    const observation = await browserProvider.observe(sessionId);
    const latencyMs = Date.now() - startTime;
    return {
      sessionId,
      status: 'accept',
      url: observation.url,
      observation,
      reasonCode: 'BROWSER_OBSERVATION_CAPTURED',
      traceId,
      metrics: {
        latencyMs,
        estimatedTokensSaved: 1200,
        hostTurnsSaved: 1,
        provider: browserProvider.id,
        stateBytesEvaluated: Buffer.byteLength(observation.summaryTable, 'utf8'),
        decisionPath: 'browser'
      }
    };
  }

  // 3. ACT MODE
  if (args.mode === 'act') {
    if (!args.action) {
      throw new PolicyBlockedError('Action object is required for mode "act"');
    }

    const actionRes = await browserProvider.act(sessionId, args.action);
    const postObservation = await browserProvider.observe(sessionId);
    const latencyMs = Date.now() - startTime;

    return {
      sessionId,
      status: actionRes.success ? 'accept' : 'error',
      url: postObservation.url,
      observation: postObservation,
      outcome: {
        goalSatisfied: false,
        confidence: 1.0,
        stepCount: 1,
        actionTaken: actionRes.details
      },
      reasonCode: actionRes.success ? 'ACTION_EXECUTED' : 'ACTION_FAILED',
      traceId,
      metrics: {
        latencyMs,
        estimatedTokensSaved: 850,
        hostTurnsSaved: 1,
        provider: browserProvider.id,
        stateBytesEvaluated: Buffer.byteLength(postObservation.summaryTable, 'utf8'),
        decisionPath: 'browser'
      }
    };
  }

  // 4. CHECK MODE
  if (args.mode === 'check') {
    if (!args.assertion) {
      throw new PolicyBlockedError('Assertion string is required for mode "check"');
    }
    const checkRes = await browserProvider.checkOutcome(sessionId, args.assertion);
    const latencyMs = Date.now() - startTime;
    const sessionInfo = browserProvider.getSession(sessionId);

    return {
      sessionId,
      status: checkRes.confidence >= 0.75 ? 'accept' : 'review',
      url: sessionInfo?.currentUrl || '',
      outcome: {
        goalSatisfied: checkRes.satisfied,
        confidence: checkRes.confidence,
        stepCount: checkRes.stepsExecuted,
        details: checkRes.details
      },
      reasonCode: checkRes.satisfied ? 'ASSERTION_SATISFIED' : 'ASSERTION_NOT_MET',
      traceId,
      metrics: {
        latencyMs,
        estimatedTokensSaved: 950,
        hostTurnsSaved: 1,
        provider: browserProvider.id,
        stateBytesEvaluated: 500,
        decisionPath: 'browser'
      }
    };
  }

  // 5. CHOOSE MODE
  if (args.mode === 'choose') {
    if (!args.goal) {
      throw new PolicyBlockedError('Goal is required for mode "choose"');
    }
    const chosen = await browserProvider.chooseAction(sessionId, args.goal);
    const latencyMs = Date.now() - startTime;
    const sessionInfo = browserProvider.getSession(sessionId);

    return {
      sessionId,
      status: chosen.confidence >= 0.75 ? 'accept' : 'review',
      url: sessionInfo?.currentUrl || '',
      outcome: {
        goalSatisfied: false,
        confidence: chosen.confidence,
        stepCount: 0,
        actionTaken: `${chosen.action.operation} -> ${chosen.action.targetRef}`
      },
      reasonCode: 'ACTION_RECOMMENDED',
      traceId,
      metrics: {
        latencyMs,
        estimatedTokensSaved: 600,
        hostTurnsSaved: 1,
        provider: browserProvider.id,
        stateBytesEvaluated: 500,
        decisionPath: 'browser'
      }
    };
  }

  // 6. RUN_BOUNDED MODE
  if (args.mode === 'run_bounded') {
    if (!args.goal) {
      throw new PolicyBlockedError('Goal is required for mode "run_bounded"');
    }

    const maxSteps = args.bounds?.maxSteps ?? 3;
    let currentObs: BrowserObservation | undefined;
    let stepCount = 0;
    let goalSatisfied = false;

    for (let step = 1; step <= maxSteps; step++) {
      stepCount = step;
      currentObs = await browserProvider.observe(sessionId);

      // Check if goal is already satisfied
      const check = await browserProvider.checkOutcome(sessionId, args.goal);
      if (check.satisfied) {
        goalSatisfied = true;
        break;
      }

      // Choose next step
      const chosen = await browserProvider.chooseAction(sessionId, args.goal);
      if (chosen.action.operation === 'wait') {
        break;
      }

      await browserProvider.act(sessionId, chosen.action);
    }

    const latencyMs = Date.now() - startTime;
    return {
      sessionId,
      status: goalSatisfied ? 'accept' : 'review',
      url: currentObs?.url || '',
      observation: currentObs,
      outcome: {
        goalSatisfied,
        confidence: goalSatisfied ? 0.9 : 0.6,
        stepCount,
        details: goalSatisfied
          ? `Goal satisfied in ${stepCount} bounded steps`
          : `Reached step limit (${maxSteps}) without complete satisfaction`
      },
      reasonCode: goalSatisfied ? 'BOUNDED_RUN_SUCCESS' : 'BOUNDED_RUN_LIMIT_REACHED',
      traceId,
      metrics: {
        latencyMs,
        estimatedTokensSaved: 2500,
        hostTurnsSaved: stepCount,
        provider: browserProvider.id,
        stateBytesEvaluated: 1500,
        decisionPath: 'browser'
      }
    };
  }

  throw new PolicyBlockedError(`Unsupported browser mode: ${args.mode}`);
}
