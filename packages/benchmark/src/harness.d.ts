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
export declare class BenchmarkHarness {
    static executeScenario(scenario: BenchmarkScenario): Promise<BenchmarkReport>;
}
//# sourceMappingURL=harness.d.ts.map