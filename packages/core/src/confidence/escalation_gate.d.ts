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
export declare class EscalationGate {
    static readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.75;
    static readonly DEFAULT_REVIEW_THRESHOLD = 0.55;
    static readonly DEFAULT_MIN_MARGIN = 0.15;
    /**
     * Evaluates answers across questions against configured policy thresholds.
     */
    static evaluate(answers: Record<string, TypedAnswer>, policy?: FastpathPolicyConfig): GateResult;
}
//# sourceMappingURL=escalation_gate.d.ts.map