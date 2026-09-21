/**
 * Benchmark Harness for measuring token and context savings.
 */

import { BenchmarkScenario } from './scenarios.js';

export interface BenchmarkReport {
  scenarioId: string;
  scenarioName: string;
  rawBytes: number;
  rawEstimatedTokens: number;
  compactBytes: number;
  compactEstimatedTokens: number;
  contextReductionPercent: number;
  latencyMs: number;
  success: boolean;
}

export class BenchmarkHarness {
  public static async executeScenario(scenario: BenchmarkScenario): Promise<BenchmarkReport> {
    const rawStr = typeof scenario.rawInput === 'string' ? scenario.rawInput : JSON.stringify(scenario.rawInput);
    const rawBytes = Buffer.byteLength(rawStr, 'utf8');
    const rawEstimatedTokens = Math.ceil(rawStr.length / 4);

    const result = await scenario.runFastpath();

    const compactStr = JSON.stringify(result.compactOutput);
    const compactBytes = Buffer.byteLength(compactStr, 'utf8');
    const compactEstimatedTokens = Math.ceil(compactStr.length / 4);

    const contextReductionPercent = Math.round(((rawEstimatedTokens - compactEstimatedTokens) / rawEstimatedTokens) * 100);

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      rawBytes,
      rawEstimatedTokens,
      compactBytes,
      compactEstimatedTokens,
      contextReductionPercent: Math.max(0, contextReductionPercent),
      latencyMs: result.latencyMs,
      success: result.success
    };
  }
}
