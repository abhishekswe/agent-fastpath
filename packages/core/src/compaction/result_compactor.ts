/**
 * Result Compactor: Compresses outputs into minimal typed shapes,
 * avoids leaking raw context, and measures tokens avoided.
 */

import { FastpathMetrics, TypedAnswer } from '../contracts/types.js';

export class ResultCompactor {
  /**
   * Estimates tokens from character count using standard ~4 chars/token heuristic.
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculates metrics for tokens and turns avoided by using the fast path.
   */
  public static computeMetrics(
    rawState: string | Record<string, unknown>,
    compactResponse: unknown,
    latencyMs: number,
    provider: string,
    decisionPath: 'deterministic' | 'semantic_jev' | 'browser' | 'escalation'
  ): FastpathMetrics {
    const rawText = typeof rawState === 'string' ? rawState : JSON.stringify(rawState);
    const compactText = JSON.stringify(compactResponse);

    const rawTokens = this.estimateTokens(rawText);
    const compactTokens = this.estimateTokens(compactText);

    // Baseline host agent call requires sending the raw state plus system prompt overhead (~400 tokens)
    // plus generating conversational explanations (~250 tokens).
    const estimatedTokensSaved = Math.max(0, rawTokens + 650 - compactTokens);

    return {
      latencyMs,
      estimatedTokensSaved,
      hostTurnsSaved: 1,
      provider,
      stateBytesEvaluated: Buffer.byteLength(rawText, 'utf8'),
      decisionPath
    };
  }

  /**
   * Extracts compact evidence reference without returning full raw dumps.
   */
  public static extractCompactSnippet(text: string, maxLength: number = 120): string {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return clean.slice(0, maxLength - 3) + '...';
  }
}
