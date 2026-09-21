/**
 * Benchmark scenarios measuring token reduction, latency, and accuracy.
 */
export interface BenchmarkScenario {
    id: string;
    name: string;
    description: string;
    rawInput: string | Record<string, unknown>;
    runFastpath: () => Promise<{
        compactOutput: unknown;
        latencyMs: number;
        tokensSaved: number;
        success: boolean;
    }>;
}
export declare function createTriageScenario(router: any): BenchmarkScenario;
export declare function createShipGateScenario(router: any): BenchmarkScenario;
//# sourceMappingURL=scenarios.d.ts.map