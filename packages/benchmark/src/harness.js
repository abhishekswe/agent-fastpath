/**
 * Benchmark Harness for measuring token and context savings.
 */
export class BenchmarkHarness {
    static async executeScenario(scenario) {
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
//# sourceMappingURL=harness.js.map