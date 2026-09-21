/**
 * Capability Router: Routes requests following the core architectural hierarchy:
 * 1. Deterministic code first.
 * 2. TypeSafe System One (Jev) semantic judgment second.
 * 3. Browser provider third (when page state/interaction is requested).
 * 4. Escalation to host agent upon ambiguity, low confidence, or policy block.
 */

import {
  FastpathEvaluateInput,
  FastpathEvaluateOutput,
  FastpathPolicyConfig,
  QuestionDef,
  TypedAnswer
} from '../contracts/types.js';
import { JudgmentProvider } from '../contracts/provider.js';
import { DeterministicEngine } from '../policies/deterministic_engine.js';
import { PRESET_REGISTRY } from '../policies/presets.js';
import { EscalationGate } from '../confidence/escalation_gate.js';
import { ResultCompactor } from '../compaction/result_compactor.js';
import { defaultEvidenceStore, LocalEvidenceStore } from '../evidence/evidence_store.js';
import { defaultMetricsRecorder } from '../metrics/metrics_recorder.js';
import { PolicyBlockedError } from '../errors/errors.js';

export interface CapabilityRouterOptions {
  judgmentProvider: JudgmentProvider;
  defaultPolicy?: FastpathPolicyConfig;
}

export class CapabilityRouter {
  private judgmentProvider: JudgmentProvider;
  private defaultPolicy: FastpathPolicyConfig;

  constructor(options: CapabilityRouterOptions) {
    this.judgmentProvider = options.judgmentProvider;
    this.defaultPolicy = {
      confidenceThreshold: 0.75,
      minMargin: 0.15,
      escalateOnAmbiguity: true,
      allowIrreversible: false,
      maxStateSizeBytes: 256 * 1024,
      redactSecrets: true,
      ...options.defaultPolicy
    };
  }

  /**
   * Main evaluation entrypoint
   */
  public async evaluate(input: FastpathEvaluateInput): Promise<FastpathEvaluateOutput> {
    const startTime = Date.now();
    const traceId = LocalEvidenceStore.generateTraceId();
    const policy = { ...this.defaultPolicy, ...input.policy };

    // 1. Validate payload size
    const rawStateStr = typeof input.state === 'string' ? input.state : JSON.stringify(input.state);
    const byteSize = Buffer.byteLength(rawStateStr, 'utf8');
    if (policy.maxStateSizeBytes && byteSize > policy.maxStateSizeBytes) {
      throw new PolicyBlockedError(
        `Supplied state size (${byteSize} bytes) exceeds maximum limit (${policy.maxStateSizeBytes} bytes)`
      );
    }

    // 2. Secret Redaction
    let sanitizedState = rawStateStr;
    let appliedRedactions: string[] = [];
    if (policy.redactSecrets) {
      const red = DeterministicEngine.redactSecrets(rawStateStr);
      sanitizedState = red.redacted;
      appliedRedactions = red.redactions;
    }

    // 3. STEP 1: Deterministic Engine First
    const detResult = DeterministicEngine.evaluateExact(
      sanitizedState,
      input.preset,
      input.presetParams
    );

    if (detResult.handled) {
      const latencyMs = Date.now() - startTime;
      const metrics = ResultCompactor.computeMetrics(
        rawStateStr,
        { decision: detResult.decision, reasonCode: detResult.reasonCode },
        latencyMs,
        'deterministic',
        'deterministic'
      );

      const output: FastpathEvaluateOutput = {
        status: detResult.confidence >= (policy.confidenceThreshold ?? 0.75) ? 'accept' : 'review',
        decision: detResult.decision,
        confidence: detResult.confidence,
        answers: {},
        reasonCode: detResult.reasonCode,
        recommendedAction: 'proceed',
        traceId,
        metrics
      };

      await defaultEvidenceStore.saveTrace({
        traceId,
        timestamp: new Date().toISOString(),
        tool: 'fastpath_evaluate',
        status: output.status,
        decisionPath: 'deterministic',
        stateSummary: ResultCompactor.extractCompactSnippet(sanitizedState),
        latencyBreakdownMs: { deterministicMs: latencyMs },
        redactionsApplied: appliedRedactions,
        diagnostics: detResult.details,
        estimatedTokensSaved: metrics.estimatedTokensSaved
      });

      defaultMetricsRecorder.record({
        tool: 'fastpath_evaluate',
        latencyMs,
        status: output.status,
        estimatedTokensSaved: metrics.estimatedTokensSaved,
        hostTurnsSaved: 1,
        provider: 'deterministic',
        decisionPath: 'deterministic'
      });

      return output;
    }

    // 4. STEP 2: Resolve Questions (from preset or explicit question definitions)
    let questionsToAsk: Record<string, QuestionDef> = {};
    let presetDef = input.preset ? PRESET_REGISTRY[input.preset] : undefined;

    if (presetDef) {
      questionsToAsk = presetDef.buildQuestions(input.presetParams);
    } else if (input.questions && Object.keys(input.questions).length > 0) {
      questionsToAsk = input.questions;
    } else {
      throw new PolicyBlockedError('Either a valid preset or questions map must be provided.');
    }

    // 5. STEP 3: Semantic Judgment Provider (TypeSafe System One / Jev)
    let judgmentResult;
    try {
      judgmentResult = await this.judgmentProvider.evaluate({
        state: sanitizedState,
        questions: questionsToAsk,
        deadlineMs: input.deadlineMs
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      defaultMetricsRecorder.record({
        tool: 'fastpath_evaluate',
        latencyMs,
        status: 'error',
        estimatedTokensSaved: 0,
        hostTurnsSaved: 0,
        provider: this.judgmentProvider.id,
        decisionPath: 'semantic_jev'
      });

      return {
        status: 'error',
        confidence: 0,
        answers: {},
        reasonCode: `PROVIDER_ERROR: ${err.message}`,
        recommendedAction: 'fallback_large_model',
        traceId,
        metrics: {
          latencyMs,
          estimatedTokensSaved: 0,
          hostTurnsSaved: 0,
          provider: this.judgmentProvider.id,
          stateBytesEvaluated: byteSize,
          decisionPath: 'semantic_jev'
        }
      };
    }

    // 6. STEP 4: Confidence & Escalation Gate
    const gateResult = EscalationGate.evaluate(judgmentResult.answers, policy);

    // 7. Synthesize decision if preset provided synthesis
    let finalDecision: string | number | boolean | undefined;
    let finalReasonCode = gateResult.reasonCode;

    if (presetDef?.synthesizeDecision) {
      const syn = presetDef.synthesizeDecision(judgmentResult.answers);
      finalDecision = syn.decision;
      if (gateResult.status === 'accept') {
        finalReasonCode = syn.reasonCode;
      }
    } else {
      // Pick first question's answer if single question
      const firstKey = Object.keys(judgmentResult.answers)[0];
      if (firstKey) {
        const firstAns = judgmentResult.answers[firstKey];
        if ('choice' in firstAns) finalDecision = firstAns.choice;
        else if ('score' in firstAns) finalDecision = firstAns.score;
        else if ('answer' in firstAns) finalDecision = firstAns.answer;
      }
    }

    const latencyMs = Date.now() - startTime;
    const metrics = ResultCompactor.computeMetrics(
      rawStateStr,
      { decision: finalDecision, answers: judgmentResult.answers },
      latencyMs,
      this.judgmentProvider.id,
      gateResult.status === 'escalate' ? 'escalation' : 'semantic_jev'
    );

    const output: FastpathEvaluateOutput = {
      status: gateResult.status,
      decision: finalDecision,
      confidence: gateResult.overallConfidence,
      margin: gateResult.margin,
      answers: judgmentResult.answers,
      reasonCode: finalReasonCode,
      recommendedAction: gateResult.recommendedAction,
      traceId,
      metrics
    };

    await defaultEvidenceStore.saveTrace({
      traceId,
      timestamp: new Date().toISOString(),
      tool: 'fastpath_evaluate',
      status: output.status,
      decisionPath: gateResult.status === 'escalate' ? 'escalation' : 'semantic_jev',
      stateSummary: ResultCompactor.extractCompactSnippet(sanitizedState),
      questions: questionsToAsk,
      answers: judgmentResult.answers,
      latencyBreakdownMs: {
        totalMs: latencyMs,
        providerMs: judgmentResult.latencyMs
      },
      redactionsApplied: appliedRedactions,
      estimatedTokensSaved: metrics.estimatedTokensSaved
    });

    defaultMetricsRecorder.record({
      tool: 'fastpath_evaluate',
      latencyMs,
      status: output.status,
      estimatedTokensSaved: metrics.estimatedTokensSaved,
      hostTurnsSaved: 1,
      provider: this.judgmentProvider.id,
      decisionPath: gateResult.status === 'escalate' ? 'escalation' : 'semantic_jev'
    });

    return output;
  }
}
