/**
 * Capability Router: routes each evaluation through the architectural hierarchy:
 *   1. Deterministic code first.
 *   2. Semantic judgment (TypeSafe System One / Jev) second.
 *   3. Escalation back to the host on low confidence, ambiguity, or an unavailable provider.
 * Browser work goes through the browser tool, not this router.
 */

import {
  EvaluationStatus,
  FastpathEvaluateInput,
  FastpathEvaluateOutput,
  FastpathPolicyConfig,
  QuestionDef,
  TypedAnswer
} from '../contracts/types.js';
import { JudgmentProvider } from '../contracts/provider.js';
import { DEFAULT_MAX_STATE_BYTES } from '../config/server_config.js';
import { DeterministicEngine } from '../policies/deterministic_engine.js';
import { PRESET_REGISTRY, PresetDecision } from '../policies/presets.js';
import { EscalationGate, GateResult } from '../confidence/escalation_gate.js';
import { ResultCompactor } from '../compaction/result_compactor.js';
import { defaultEvidenceStore, LocalEvidenceStore } from '../evidence/evidence_store.js';
import { defaultMetricsRecorder } from '../metrics/metrics_recorder.js';
import { PolicyBlockedError } from '../errors/errors.js';

export interface CapabilityRouterOptions {
  judgmentProvider: JudgmentProvider;
  /** Server-side state size cap. Callers may lower it per call, never raise it. */
  maxStateSizeBytes?: number;
}

interface PreparedState {
  traceId: string;
  startTime: number;
  policy: FastpathPolicyConfig;
  rawBytes: number;
  sanitized: string;
  redactions: string[];
}

export class CapabilityRouter {
  private readonly judgmentProvider: JudgmentProvider;
  private readonly maxStateSizeBytes: number;

  constructor(options: CapabilityRouterOptions) {
    this.judgmentProvider = options.judgmentProvider;
    this.maxStateSizeBytes = options.maxStateSizeBytes ?? DEFAULT_MAX_STATE_BYTES;
  }

  public getJudgmentProvider(): JudgmentProvider {
    return this.judgmentProvider;
  }

  /**
   * Main evaluation entrypoint.
   */
  public async evaluate(input: FastpathEvaluateInput): Promise<FastpathEvaluateOutput> {
    const prepared = this.prepare(input);

    const det = DeterministicEngine.evaluateExact(prepared.sanitized, input.preset, input.presetParams);
    if (det.handled) {
      const threshold = prepared.policy.confidenceThreshold ?? EscalationGate.DEFAULT_CONFIDENCE_THRESHOLD;
      const isBlocked = det.decision === 'BLOCKED';
      const isRisk = det.decision === 'HIGH_RISK';
      const status: EvaluationStatus = isBlocked
        ? 'blocked'
        : isRisk
          ? 'review'
          : det.confidence >= threshold
            ? 'accept'
            : 'review';
      const recommendedAction = isBlocked
        ? 'fix_and_retry'
        : isRisk
          ? 'ask_user'
          : det.confidence >= threshold
            ? 'proceed'
            : 'inspect_evidence';

      return this.finish(prepared, {
        status,
        decision: det.decision,
        confidence: det.confidence,
        answers: {},
        reasonCode: det.reasonCode,
        recommendedAction
      }, 'deterministic', 'deterministic', { deterministic: det.details });
    }

    const presetDef = input.preset ? PRESET_REGISTRY[input.preset] : undefined;
    if (input.preset && !presetDef) {
      throw new PolicyBlockedError(`Unknown preset '${input.preset}'.`);
    }
    const questions = presetDef ? presetDef.buildQuestions(input.presetParams) : input.questions;
    if (!questions || Object.keys(questions).length === 0) {
      throw new PolicyBlockedError('Either a valid preset or questions map must be provided.');
    }
    validateQuestions(questions);

    const provider = this.judgmentProvider;
    if (!provider.available) {
      return this.finish(prepared, {
        status: 'escalate',
        confidence: 0,
        answers: {},
        reasonCode: 'JUDGMENT_PROVIDER_UNAVAILABLE',
        recommendedAction: 'fallback_large_model',
        message: 'No judgment provider is configured. Set TYPESAFE_API_KEY to enable semantic evaluation.'
      }, 'escalation', provider.id, { questions });
    }

    let judgment;
    try {
      judgment = await provider.evaluate({
        state: prepared.sanitized,
        questions,
        deadlineMs: input.deadlineMs
      });
    } catch (err: any) {
      return this.finish(prepared, {
        status: 'error',
        confidence: 0,
        answers: {},
        reasonCode: 'PROVIDER_ERROR',
        recommendedAction: 'fallback_large_model',
        message: err?.message ?? String(err)
      }, 'semantic_jev', provider.id, { questions });
    }

    const gate = EscalationGate.evaluate(judgment.answers, prepared.policy);
    const synthesized = presetDef?.synthesizeDecision?.(judgment.answers);
    const outcome = combine(gate, synthesized, judgment.answers, prepared.policy);

    return this.finish(prepared, {
      ...outcome,
      confidence: gate.overallConfidence,
      margin: gate.margin,
      answers: judgment.answers
    }, outcome.status === 'escalate' ? 'escalation' : 'semantic_jev', provider.id, {
      questions,
      answers: judgment.answers,
      providerMs: judgment.latencyMs,
      model: judgment.model,
      gate
    });
  }

  private prepare(input: FastpathEvaluateInput): PreparedState {
    const startTime = Date.now();
    const policy = input.policy ?? {};
    const limit = Math.min(this.maxStateSizeBytes, policy.maxStateSizeBytes ?? Infinity);

    const raw = typeof input.state === 'string' ? input.state : JSON.stringify(input.state);
    const rawBytes = Buffer.byteLength(raw, 'utf8');
    if (rawBytes > limit) {
      throw new PolicyBlockedError(
        `Supplied state size (${rawBytes} bytes) exceeds maximum limit (${limit} bytes)`
      );
    }

    // Redaction is a server guarantee: secrets never reach the judgment provider or traces.
    const red = DeterministicEngine.redactSecrets(raw);
    return {
      traceId: LocalEvidenceStore.generateTraceId(),
      startTime,
      policy,
      rawBytes,
      sanitized: red.redacted,
      redactions: red.redactions
    };
  }

  private async finish(
    prepared: PreparedState,
    result: Omit<FastpathEvaluateOutput, 'traceId' | 'metrics'>,
    decisionPath: FastpathEvaluateOutput['metrics']['decisionPath'],
    providerId: string,
    extra: {
      questions?: Record<string, QuestionDef>;
      answers?: Record<string, TypedAnswer>;
      providerMs?: number;
      model?: string;
      gate?: GateResult;
      deterministic?: Record<string, unknown>;
    }
  ): Promise<FastpathEvaluateOutput> {
    const latencyMs = Date.now() - prepared.startTime;
    const metrics = ResultCompactor.computeMetrics({
      stateBytes: prepared.rawBytes,
      unseenBytes: 0,
      response: { decision: result.decision, answers: result.answers },
      latencyMs,
      provider: providerId,
      decisionPath
    });
    const output: FastpathEvaluateOutput = { ...result, traceId: prepared.traceId, metrics };

    await defaultEvidenceStore.saveTrace({
      traceId: prepared.traceId,
      timestamp: new Date().toISOString(),
      tool: 'fastpath_evaluate',
      status: output.status,
      decisionPath,
      stateSummary: ResultCompactor.extractCompactSnippet(prepared.sanitized),
      questions: extra.questions,
      answers: extra.answers,
      latencyBreakdownMs: {
        totalMs: latencyMs,
        ...(extra.providerMs !== undefined ? { providerMs: extra.providerMs } : {})
      },
      redactionsApplied: prepared.redactions,
      diagnostics: {
        reasonCode: output.reasonCode,
        policy: prepared.policy,
        ...(output.message ? { message: output.message } : {}),
        ...(extra.model ? { model: extra.model } : {}),
        ...(extra.gate ? { gate: extra.gate } : {}),
        ...(extra.deterministic ? { deterministic: extra.deterministic } : {})
      },
      estimatedTokensSaved: metrics.estimatedTokensSaved
    });

    defaultMetricsRecorder.record({
      tool: 'fastpath_evaluate',
      latencyMs,
      status: output.status,
      estimatedTokensSaved: metrics.estimatedTokensSaved,
      hostTurnsSaved: output.status === 'accept' ? 1 : 0,
      provider: providerId,
      decisionPath
    });

    return output;
  }
}

/**
 * Merges the confidence gate with the preset's own decision.
 * A preset escalation (for example, contradictory requirements) overrides a confident
 * gate, because a confident "this is ambiguous" still needs the user to resolve it.
 */
function combine(
  gate: GateResult,
  synthesized: PresetDecision | undefined,
  answers: Record<string, TypedAnswer>,
  policy: FastpathPolicyConfig
): Pick<FastpathEvaluateOutput, 'status' | 'decision' | 'reasonCode' | 'recommendedAction'> {
  const decision = synthesized ? synthesized.decision : firstAnswerValue(answers);
  const escalateOnAmbiguity = policy.escalateOnAmbiguity ?? true;

  if (synthesized?.escalate && escalateOnAmbiguity && gate.status !== 'escalate') {
    return {
      status: 'escalate' as EvaluationStatus,
      decision,
      reasonCode: synthesized.reasonCode,
      recommendedAction: 'ask_user'
    };
  }

  if (decision === 'BLOCKED') {
    return {
      status: 'blocked' as EvaluationStatus,
      decision,
      reasonCode: synthesized?.reasonCode ?? gate.reasonCode,
      recommendedAction: 'fix_and_retry'
    };
  }

  if (decision === 'HIGH_RISK') {
    return {
      status: 'review' as EvaluationStatus,
      decision,
      reasonCode: synthesized?.reasonCode ?? gate.reasonCode,
      recommendedAction: 'ask_user'
    };
  }

  if (decision === 'NEEDS_REVIEW' && gate.status === 'accept') {
    return {
      status: 'review' as EvaluationStatus,
      decision,
      reasonCode: synthesized?.reasonCode ?? gate.reasonCode,
      recommendedAction: 'inspect_evidence'
    };
  }

  return {
    status: gate.status,
    decision,
    reasonCode: gate.status === 'accept' && synthesized ? synthesized.reasonCode : gate.reasonCode,
    recommendedAction: gate.recommendedAction
  };
}

function firstAnswerValue(answers: Record<string, TypedAnswer>): string | number | boolean | undefined {
  const first = Object.values(answers)[0];
  if (!first) return undefined;
  if ('choice' in first) return first.choice;
  if ('score' in first) return first.score;
  return first.answer;
}

function validateQuestions(questions: Record<string, QuestionDef>): void {
  for (const [key, q] of Object.entries(questions)) {
    if (!q.instructions?.trim()) {
      throw new PolicyBlockedError(`Question '${key}' needs non-empty instructions.`);
    }
    if (q.type === 'choice') {
      const options = q.criteria && !Array.isArray(q.criteria) ? Object.keys(q.criteria) : [];
      if (options.length < 2) {
        throw new PolicyBlockedError(`Choice question '${key}' needs a criteria object with at least 2 options.`);
      }
    } else if (q.type === 'score') {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2) {
        throw new PolicyBlockedError(`Score question '${key}' needs a criteria array with at least 2 ordered levels.`);
      }
    }
  }
}
