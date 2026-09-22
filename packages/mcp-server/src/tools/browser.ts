/**
 * MCP tool handler for fastpath_browser.
 *
 * Deterministic browser work (observe, act, phrase checks) runs in the provider.
 * Semantic steps (does the page satisfy a claim, which element serves a goal) go
 * through the capability router, so they get the same confidence gate as evaluate.
 */

import { z } from 'zod';
import {
  BrowserAction,
  BrowserObservation,
  BrowserProvider,
  CapabilityRouter,
  defaultEvidenceStore,
  EvaluationStatus,
  FastpathBrowserOutput,
  FastpathServerConfig,
  InteractiveElement,
  LocalEvidenceStore,
  PolicyBlockedError,
  ResultCompactor,
  SessionLimits
} from '@agentctl/core';

const PAGE_TEXT_FOR_JUDGMENT = 6000;
const MAX_CHOICE_ELEMENTS = 40;

function estimateObservationBytes(obs: BrowserObservation): number {
  return Buffer.byteLength(obs.summaryTable, 'utf8') + Buffer.byteLength(JSON.stringify(obs.elements), 'utf8');
}

export const FastpathBrowserShape = {
  mode: z
    .enum(['open', 'observe', 'act', 'check', 'choose', 'run_bounded', 'close'])
    .describe(
      'open: new session at url. observe: fresh element table. act: one action on a ref. ' +
        'check: verify an assertion. choose: recommend the next action for a goal. ' +
        'run_bounded: take up to maxSteps safe clicks toward a goal. close: end the session.'
    ),
  sessionId: z.string().optional().describe('Session from a previous open. Required for all modes except open.'),
  url: z.string().optional().describe('URL for open.'),
  action: z
    .object({
      operation: z.enum(['click', 'type', 'select', 'scroll_down', 'scroll_up', 'wait']),
      targetRef: z.string().optional().describe('Element ref from the latest observation, e.g. "obs_ab12cd:3".'),
      textValue: z.string().optional().describe('Text for type.'),
      selectOption: z.string().optional().describe('Option for select.')
    })
    .optional()
    .describe('Action for act.'),
  goal: z.string().optional().describe('Goal for choose and run_bounded.'),
  assertion: z.string().optional().describe('What should be true of the page, for check.'),
  allowIrreversible: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set true only after the user confirms a delete, purchase, payment, or similar action.'),
  bounds: z
    .object({
      maxSteps: z.number().int().positive().optional(),
      timeoutMs: z.number().int().positive().optional(),
      allowedOrigins: z.array(z.string()).optional().describe('e.g. ["https://example.com", "*.example.org"]')
    })
    .optional()
    .describe('Tighten the server limits for this session. Cannot loosen them.')
};

export const FastpathBrowserSchema = z.object(FastpathBrowserShape);

type BrowserArgs = z.infer<typeof FastpathBrowserSchema>;

export interface BrowserToolDeps {
  browser: BrowserProvider;
  router: CapabilityRouter;
  config: FastpathServerConfig;
}

interface CheckResult {
  satisfied: boolean;
  confidence: number;
  status: EvaluationStatus;
  details: string;
  pageBytes: number;
}

export async function handleFastpathBrowser(deps: BrowserToolDeps, args: BrowserArgs): Promise<FastpathBrowserOutput> {
  const start = Date.now();
  const traceId = LocalEvidenceStore.generateTraceId();
  const { browser } = deps;

  const respond = async (
    sessionId: string,
    body: Omit<FastpathBrowserOutput, 'sessionId' | 'traceId' | 'metrics'>,
    unseenBytes: number
  ): Promise<FastpathBrowserOutput> => {
    const response = { ...body, sessionId };
    const metrics = ResultCompactor.computeMetrics({
      stateBytes: unseenBytes,
      unseenBytes,
      response,
      latencyMs: Date.now() - start,
      provider: browser.id,
      decisionPath: body.status === 'escalate' ? 'escalation' : 'browser'
    });

    await defaultEvidenceStore.saveTrace({
      traceId,
      timestamp: new Date().toISOString(),
      tool: 'fastpath_browser',
      status: body.status,
      decisionPath: metrics.decisionPath,
      stateSummary: `Browser mode: ${args.mode} on ${body.url || 'session ' + sessionId}`,
      latencyBreakdownMs: { totalMs: Date.now() - start },
      redactionsApplied: [],
      diagnostics: {
        sessionId,
        mode: args.mode,
        url: body.url,
        action: args.action,
        goal: args.goal,
        assertion: args.assertion,
        reasonCode: body.reasonCode
      },
      estimatedTokensSaved: metrics.estimatedTokensSaved
    });

    return {
      ...response,
      traceId,
      metrics
    };
  };

  if (args.mode === 'open') {
    if (!args.url) throw new PolicyBlockedError('url is required for mode "open"');
    const sessionId = await browser.createSession({ limits: mergeLimits(deps.config, args.bounds) });
    try {
      await browser.navigate(sessionId, args.url);
    } catch (err) {
      await browser.closeSession(sessionId);
      throw err;
    }
    const observation = await browser.observe(sessionId);
    return await respond(
      sessionId,
      { status: 'accept', url: observation.url, observation, reasonCode: 'BROWSER_OPENED_AND_OBSERVED' },
      estimateObservationBytes(observation)
    );
  }

  const sessionId = args.sessionId;
  if (!sessionId) throw new PolicyBlockedError(`sessionId is required for mode "${args.mode}"`);

  switch (args.mode) {
    case 'close': {
      const existed = Boolean(browser.getSession(sessionId));
      await browser.closeSession(sessionId);
      return await respond(
        sessionId,
        { status: 'accept', url: '', closed: existed, reasonCode: existed ? 'SESSION_CLOSED' : 'SESSION_NOT_FOUND' },
        0
      );
    }

    case 'observe': {
      const observation = await browser.observe(sessionId);
      return await respond(
        sessionId,
        { status: 'accept', url: observation.url, observation, reasonCode: 'BROWSER_OBSERVATION_CAPTURED' },
        estimateObservationBytes(observation)
      );
    }

    case 'act': {
      if (!args.action) throw new PolicyBlockedError('action is required for mode "act"');
      const result = await browser.act(sessionId, args.action, { allowIrreversible: args.allowIrreversible });
      const observation = await browser.observe(sessionId);
      return await respond(
        sessionId,
        {
          status: 'accept',
          url: observation.url,
          observation,
          outcome: { goalSatisfied: false, confidence: 1, stepCount: 1, actionTaken: result.details },
          reasonCode: 'ACTION_EXECUTED'
        },
        estimateObservationBytes(observation)
      );
    }

    case 'check': {
      if (!args.assertion) throw new PolicyBlockedError('assertion is required for mode "check"');
      const check = await checkAssertion(deps, sessionId, args.assertion);
      return await respond(
        sessionId,
        {
          status: check.status,
          url: browser.getSession(sessionId)?.currentUrl ?? '',
          outcome: {
            goalSatisfied: check.satisfied,
            confidence: check.confidence,
            stepCount: 0,
            details: check.details
          },
          reasonCode: check.satisfied ? 'ASSERTION_SATISFIED' : 'ASSERTION_NOT_MET'
        },
        check.pageBytes
      );
    }

    case 'choose': {
      if (!args.goal) throw new PolicyBlockedError('goal is required for mode "choose"');
      const observation = await browser.observe(sessionId);
      const choice = await chooseAction(deps, observation, args.goal, args.allowIrreversible);
      return await respond(
        sessionId,
        {
          status: choice.status,
          url: observation.url,
          observation,
          outcome: {
            goalSatisfied: false,
            confidence: choice.confidence,
            stepCount: 0,
            actionTaken: choice.action ? describe(choice.action, choice.element) : undefined,
            details: choice.details
          },
          reasonCode: choice.reasonCode
        },
        estimateObservationBytes(observation)
      );
    }

    case 'run_bounded':
      return await respondRun(deps, sessionId, args, respond);
  }
}

async function respondRun(
  deps: BrowserToolDeps,
  sessionId: string,
  args: BrowserArgs,
  respond: (id: string, body: Omit<FastpathBrowserOutput, 'sessionId' | 'traceId' | 'metrics'>, unseen: number) => Promise<FastpathBrowserOutput>
): Promise<FastpathBrowserOutput> {
  if (!args.goal) throw new PolicyBlockedError('goal is required for mode "run_bounded"');
  const maxSteps = Math.min(args.bounds?.maxSteps ?? deps.config.maxBrowserSteps, deps.config.maxBrowserSteps);

  let observation: BrowserObservation | undefined;
  let unseen = 0;
  const taken: string[] = [];
  let finish: { status: EvaluationStatus; reasonCode: string; details: string; satisfied: boolean; confidence: number } | undefined;

  for (let step = 0; step <= maxSteps && !finish; step++) {
    const check = await checkAssertion(deps, sessionId, args.goal);
    unseen += check.pageBytes;
    if (check.satisfied) {
      finish = { status: 'accept', reasonCode: 'BOUNDED_RUN_SUCCESS', details: check.details, satisfied: true, confidence: check.confidence };
      break;
    }
    if (step === maxSteps) break;

    observation = await deps.browser.observe(sessionId);
    unseen += estimateObservationBytes(observation);
    // Autonomous runs never take irreversible actions, whatever the caller passed.
    const choice = await chooseAction(deps, observation, args.goal, false);
    if (choice.status !== 'accept' || !choice.action) {
      finish = { status: 'review', reasonCode: choice.reasonCode, details: choice.details, satisfied: false, confidence: choice.confidence };
      break;
    }
    if (choice.action.operation !== 'click') {
      finish = {
        status: 'review',
        reasonCode: 'NEEDS_HOST_INPUT',
        details: `Next step is ${describe(choice.action, choice.element)}; supply the value with mode "act".`,
        satisfied: false,
        confidence: choice.confidence
      };
      break;
    }
    const result = await deps.browser.act(sessionId, choice.action, { allowIrreversible: false });
    taken.push(result.details ?? describe(choice.action, choice.element));
  }

  observation = await deps.browser.observe(sessionId);
  finish ??= {
    status: 'review',
    reasonCode: 'BOUNDED_RUN_LIMIT_REACHED',
    details: `Goal not confirmed after ${taken.length} step(s).`,
    satisfied: false,
    confidence: 0
  };

  return await respond(
    sessionId,
    {
      status: finish.status,
      url: observation.url,
      observation,
      outcome: {
        goalSatisfied: finish.satisfied,
        confidence: finish.confidence,
        stepCount: taken.length,
        actionTaken: taken.join(' -> ') || undefined,
        details: finish.details
      },
      reasonCode: finish.reasonCode
    },
    unseen + estimateObservationBytes(observation)
  );
}

/**
 * Exact phrase match first (fast, certain). If the phrase is not on the page verbatim,
 * ask the judgment provider whether the page text supports the assertion.
 */
async function checkAssertion(deps: BrowserToolDeps, sessionId: string, assertion: string): Promise<CheckResult> {
  const exact = await deps.browser.checkOutcome(sessionId, assertion);
  if (exact.satisfied) {
    return { satisfied: true, confidence: exact.confidence, status: 'accept', details: exact.details ?? '', pageBytes: 0 };
  }

  const text = await deps.browser.readPageText(sessionId, PAGE_TEXT_FOR_JUDGMENT);
  const info = deps.browser.getSession(sessionId);
  const res = await deps.router.evaluate({
    state: `URL: ${info?.currentUrl ?? ''}\n\nPage text:\n${text}`,
    preset: 'verify_claim',
    presetParams: { claim: assertion }
  });
  const pageBytes = Buffer.byteLength(text, 'utf8');

  if (res.status === 'escalate' || res.status === 'error') {
    return {
      satisfied: false,
      confidence: 0,
      status: 'review',
      details: `Phrase not found verbatim and semantic check unavailable (${res.reasonCode}).`,
      pageBytes
    };
  }
  const verified = res.decision === true;
  const verifiedAns = res.answers.verification_status ?? res.answers.is_verified;
  let confidence: number;
  if (verifiedAns && 'choice' in verifiedAns) {
    confidence = res.confidence;
  } else if (verifiedAns && 'noul' in verifiedAns) {
    confidence = verified ? verifiedAns.confidence : Math.round((1 - verifiedAns.noul) * 100) / 100;
  } else {
    confidence = res.confidence;
  }
  // A negative browser assertion is evidence for the host to inspect, not an action
  // that should be accepted automatically. Positive claims retain the judge's gate.
  const status: EvaluationStatus = verified ? res.status : 'review';

  return {
    satisfied: verified,
    confidence,
    status,
    details: `Semantic check: ${res.reasonCode}.`,
    pageBytes
  };
}

interface Choice {
  status: EvaluationStatus;
  confidence: number;
  reasonCode: string;
  details: string;
  action?: BrowserAction;
  element?: InteractiveElement;
}

/** Asks the judgment provider which listed element best advances the goal. */
async function chooseAction(
  deps: BrowserToolDeps,
  observation: BrowserObservation,
  goal: string,
  allowIrreversible: boolean
): Promise<Choice> {
  const candidates = observation.elements
    .filter((el) => !el.disabled && (allowIrreversible || !el.isIrreversible))
    .slice(0, MAX_CHOICE_ELEMENTS);
  if (candidates.length === 0) {
    return { status: 'review', confidence: 0, reasonCode: 'NO_ACTIONABLE_ELEMENTS', details: 'No usable elements on the page.' };
  }

  const criteria: Record<string, string> = { none: 'None of the listed elements advances the goal' };
  for (const el of candidates) {
    criteria[`e${el.index}`] = `${(el.role || el.type || el.tagName).toLowerCase()} "${el.label || 'unlabeled'}"`;
  }

  const res = await deps.router.evaluate({
    state: `Page: ${observation.title}\nURL: ${observation.url}\n\nInteractive elements:\n${observation.summaryTable}`,
    questions: {
      next_element: {
        type: 'choice',
        instructions: `Which element should be used next to achieve this goal: "${goal}"?`,
        criteria
      }
    }
  });

  const picked = String(res.decision ?? 'none');
  const element = candidates.find((el) => `e${el.index}` === picked);
  if (!element || res.status === 'escalate' || res.status === 'error') {
    return {
      status: res.status === 'accept' ? 'review' : res.status,
      confidence: res.confidence,
      reasonCode: element ? res.reasonCode : 'NO_ELEMENT_ADVANCES_GOAL',
      details: res.message ?? 'No confident next step.'
    };
  }

  const tag = element.tagName.toLowerCase();
  const operation: BrowserAction['operation'] =
    tag === 'select' ? 'select' : tag === 'textarea' || (tag === 'input' && !/^(button|submit|checkbox|radio)$/i.test(element.type ?? '')) ? 'type' : 'click';

  return {
    status: res.status,
    confidence: res.confidence,
    reasonCode: 'ACTION_RECOMMENDED',
    details: operation === 'click' ? 'Recommended click.' : `Recommended ${operation}; the value must come from the host.`,
    action: { operation, targetRef: element.ref },
    element
  };
}

function describe(action: BrowserAction, element?: InteractiveElement): string {
  return `${action.operation} ${element ? `"${element.label}" ` : ''}(${action.targetRef ?? 'page'})`;
}

/** Caller bounds can only tighten the server limits. */
export function mergeLimits(config: FastpathServerConfig, bounds?: BrowserArgs['bounds']): SessionLimits {
  let allowedOrigins = config.allowedOrigins;
  if (bounds?.allowedOrigins?.length) {
    if (config.allowedOrigins.length > 0) {
      const outside = bounds.allowedOrigins.filter((o) => !config.allowedOrigins.includes(o));
      if (outside.length > 0) {
        throw new PolicyBlockedError(`Origins outside the server allowlist: ${outside.join(', ')}`);
      }
    }
    allowedOrigins = bounds.allowedOrigins;
  }
  return {
    maxSteps: Math.min(bounds?.maxSteps ?? config.maxBrowserSteps, config.maxBrowserSteps),
    timeoutMs: Math.min(bounds?.timeoutMs ?? config.browserTimeoutMs, config.browserTimeoutMs),
    allowedOrigins,
    allowPrivateNetworks: config.allowPrivateNetworks
  };
}
