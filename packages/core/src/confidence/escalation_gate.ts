/**
 * Confidence and Escalation Gate: turns typed answers into accept / review / escalate.
 *
 * Order of checks:
 *   1. Confidence below `escalationThreshold` -> escalate (hand control back).
 *   2. Choice margin below `minMargin`        -> review (options are neck and neck).
 *   3. Confidence at or above `confidenceThreshold` -> accept.
 *   4. Otherwise                              -> review.
 */

import { EvaluationStatus, FastpathPolicyConfig, TypedAnswer } from '../contracts/types.js';

export interface GateResult {
  status: EvaluationStatus;
  overallConfidence: number;
  margin?: number;
  reasonCode: string;
  recommendedAction: 'proceed' | 'inspect_evidence' | 'ask_user' | 'fallback_large_model';
}

export class EscalationGate {
  public static readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.75;
  public static readonly DEFAULT_ESCALATION_THRESHOLD = 0.55;
  public static readonly DEFAULT_MIN_MARGIN = 0.15;

  /**
   * Evaluates answers against policy thresholds.
   * @param gatedKeys Answers that decide the outcome. Defaults to every answer.
   */
  public static evaluate(
    answers: Record<string, TypedAnswer>,
    policy?: FastpathPolicyConfig,
    gatedKeys?: string[]
  ): GateResult {
    const threshold = policy?.confidenceThreshold ?? this.DEFAULT_CONFIDENCE_THRESHOLD;
    const escalationThreshold = Math.min(
      policy?.escalationThreshold ?? this.DEFAULT_ESCALATION_THRESHOLD,
      threshold
    );
    const minMargin = policy?.minMargin ?? this.DEFAULT_MIN_MARGIN;

    const keys = (gatedKeys ?? Object.keys(answers)).filter((k) => k in answers);
    if (keys.length === 0) {
      return {
        status: 'escalate',
        overallConfidence: 0,
        reasonCode: 'NO_ANSWERS_PROVIDED',
        recommendedAction: 'fallback_large_model'
      };
    }

    let minConfidence = 1.0;
    let minObservedMargin: number | undefined;

    for (const key of keys) {
      const ans = answers[key];
      minConfidence = Math.min(minConfidence, ans.confidence);

      if ('choice' in ans) {
        const probs = Object.values(ans.probabilities).sort((a, b) => b - a);
        if (probs.length >= 2) {
          const margin = round(probs[0] - probs[1]);
          minObservedMargin = minObservedMargin === undefined ? margin : Math.min(minObservedMargin, margin);
        }
      }
    }

    const base = { overallConfidence: minConfidence, margin: minObservedMargin };

    if (minConfidence < escalationThreshold) {
      return {
        ...base,
        status: 'escalate',
        reasonCode: 'LOW_CONFIDENCE_ESCALATION_REQUIRED',
        recommendedAction: 'fallback_large_model'
      };
    }

    const escalateOnAmbiguity = policy?.escalateOnAmbiguity ?? true;
    if (escalateOnAmbiguity && minObservedMargin !== undefined && minObservedMargin < minMargin) {
      return {
        ...base,
        status: 'review',
        reasonCode: 'MARGIN_BELOW_THRESHOLD_AMBIGUITY',
        recommendedAction: 'inspect_evidence'
      };
    }

    if (minConfidence >= threshold) {
      return {
        ...base,
        status: 'accept',
        reasonCode: 'HIGH_CONFIDENCE_ACCEPTED',
        recommendedAction: 'proceed'
      };
    }

    return {
      ...base,
      status: 'review',
      reasonCode: 'MODERATE_CONFIDENCE_REVIEW_RECOMMENDED',
      recommendedAction: 'inspect_evidence'
    };
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
