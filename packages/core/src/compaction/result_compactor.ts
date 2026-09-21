/**
 * Result Compactor: keeps responses small and measures the context the host avoided.
 */

import { DecisionPath, FastpathMetrics } from '../contracts/types.js';

export interface MetricsInput {
  /** Bytes the fastpath evaluated. */
  stateBytes: number;
  /**
   * Bytes the fastpath read on the host's behalf that never entered the host context
   * (file contents, page HTML). Zero when the host supplied the state inline.
   */
  unseenBytes: number;
  /** The compact response returned to the host. */
  response: unknown;
  latencyMs: number;
  provider: string;
  decisionPath: DecisionPath;
}

export class ResultCompactor {
  /**
   * Estimates tokens from character count using the standard ~4 chars/token heuristic.
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Builds response metrics. `estimatedTokensSaved` counts only content the host did not
   * have to read, minus the size of what it receives instead.
   */
  public static computeMetrics(input: MetricsInput): FastpathMetrics {
    const unseenTokens = Math.ceil(input.unseenBytes / 4);
    const responseTokens = this.estimateTokens(JSON.stringify(input.response ?? null));
    return {
      latencyMs: input.latencyMs,
      estimatedTokensSaved: Math.max(0, unseenTokens - responseTokens),
      hostTurnsSaved: 1,
      provider: input.provider,
      stateBytesEvaluated: input.stateBytes,
      decisionPath: input.decisionPath
    };
  }

  /**
   * Extracts a compact evidence reference without returning full raw dumps.
   */
  public static extractCompactSnippet(text: string, maxLength: number = 120): string {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return clean.slice(0, maxLength - 3) + '...';
  }
}
