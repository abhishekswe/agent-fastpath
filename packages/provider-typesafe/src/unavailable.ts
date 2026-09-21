/**
 * Placeholder provider used when no judgment backend is configured.
 * The router checks `available` and escalates instead of calling it, so semantic
 * questions return control to the host rather than fabricated answers.
 */

import { JudgmentProvider, JudgmentRequest, JudgmentResult, ProviderUnavailableError } from '@agentctl/core';

export class UnavailableJudgmentProvider implements JudgmentProvider {
  public readonly id = 'none';
  public readonly available = false;
  public readonly model = 'none';

  public async evaluate(_request: JudgmentRequest): Promise<JudgmentResult> {
    throw new ProviderUnavailableError(this.id, 'TYPESAFE_API_KEY is not set');
  }

  public async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    return { healthy: false, latencyMs: 0, error: 'TYPESAFE_API_KEY is not set' };
  }
}
