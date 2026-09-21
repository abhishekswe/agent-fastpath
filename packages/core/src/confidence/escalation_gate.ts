/**
 * Confidence and Escalation Gate: evaluates model probabilities,
 * confidence margins, and determines whether to accept, review, or escalate.
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
  public static readonly DEFAULT_REVIEW_THRESHOLD = 0.55;
  public static readonly DEFAULT_MIN_MARGIN = 0.15;

  /**
   * Evaluates answers across questions against configured policy thresholds.
   */
  public static evaluate(
    answers: Record<string, TypedAnswer>,
    policy?: FastpathPolicyConfig
  ): GateResult {
    const threshold = policy?.confidenceThreshold ?? this.DEFAULT_CONFIDENCE_THRESHOLD;
    const reviewThreshold = this.DEFAULT_REVIEW_THRESHOLD;
    const minMargin = policy?.minMargin ?? this.DEFAULT_MIN_MARGIN;

    const answerKeys = Object.keys(answers);
    if (answerKeys.length === 0) {
      return {
        status: 'escalate',
        overallConfidence: 0,
        reasonCode: 'NO_ANSWERS_PROVIDED',
        recommendedAction: 'fallback_large_model'
      };
    }

    let minConfidence = 1.0;
    let minObservedMargin: number | undefined;
    let hasContradiction = false;

    for (const key of answerKeys) {
      const ans = answers[key];
      if (ans.confidence < minConfidence) {
        minConfidence = ans.confidence;
      }

      // Check choice margin between top probability and runner-up
      if ('probabilities' in ans && typeof ans.probabilities === 'object' && !Array.isArray(ans.probabilities)) {
        const probs = Object.values(ans.probabilities) as number[];
        probs.sort((a, b) => b - a);
        if (probs.length >= 2) {
          const margin = probs[0] - probs[1];
          if (minObservedMargin === undefined || margin < minObservedMargin) {
            minObservedMargin = margin;
          }
        }
      }
    }

    // 1. Low confidence (< reviewThreshold): escalate
    if (minConfidence < reviewThreshold) {
      return {
        status: 'escalate',
        overallConfidence: minConfidence,
        margin: minObservedMargin,
        reasonCode: 'LOW_CONFIDENCE_ESCALATION_REQUIRED',
        recommendedAction: 'fallback_large_model'
      };
    }

    // 2. Check if margin is too narrow (ambiguity / neck-and-neck options)
    if (minObservedMargin !== undefined && minObservedMargin < minMargin && (policy?.escalateOnAmbiguity ?? true)) {
      return {
        status: 'review',
        overallConfidence: minConfidence,
        margin: minObservedMargin,
        reasonCode: 'MARGIN_BELOW_THRESHOLD_AMBIGUITY',
        recommendedAction: 'inspect_evidence'
      };
    }

    // 3. High confidence: accept
    if (minConfidence >= threshold) {
      return {
        status: 'accept',
        overallConfidence: minConfidence,
        margin: minObservedMargin,
        reasonCode: 'HIGH_CONFIDENCE_ACCEPTED',
        recommendedAction: 'proceed'
      };
    }

    // 4. Moderate confidence: review
    return {
      status: 'review',
      overallConfidence: minConfidence,
      margin: minObservedMargin,
      reasonCode: 'MODERATE_CONFIDENCE_REVIEW_RECOMMENDED',
      recommendedAction: 'inspect_evidence'
    };
  }
}
