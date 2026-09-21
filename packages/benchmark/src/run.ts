/**
 * Benchmark runner executable.
 */

import { CapabilityRouter } from '@agentctl/core';
import { TypeSafeJudgmentProvider, MockTypeSafeProvider } from '@agentctl/provider-typesafe';
import { createTriageScenario, createShipGateScenario } from './scenarios.js';
import { BenchmarkHarness, BenchmarkReport } from './harness.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ⚡ AGENTCTL-FASTPATH CONTEXT & TOKEN REDUCTION BENCHMARKS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const provider = process.env.TYPESAFE_API_KEY
    ? new TypeSafeJudgmentProvider()
    : new MockTypeSafeProvider();

  const router = new CapabilityRouter({ judgmentProvider: provider });

  const scenarios = [
    createTriageScenario(router),
    createShipGateScenario(router)
  ];

  const reports: BenchmarkReport[] = [];

  for (const sc of scenarios) {
    console.log(`▶ Running Scenario: ${sc.name}...`);
    const report = await BenchmarkHarness.executeScenario(sc);
    reports.push(report);
    console.log(`  • Raw Tokens:           ${report.rawEstimatedTokens.toLocaleString()}`);
    console.log(`  • Compact Output:       ${report.compactEstimatedTokens.toLocaleString()} tokens`);
    console.log(`  • Context Reduction:    ${report.contextReductionPercent}% 🚀`);
    console.log(`  • Latency:              ${report.latencyMs} ms`);
    console.log(`  • Verification Result:  ${report.success ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY TABLE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.table(
    reports.map((r) => ({
      Scenario: r.scenarioName,
      'Raw Tokens': r.rawEstimatedTokens,
      'Fastpath Tokens': r.compactEstimatedTokens,
      'Reduction %': `${r.contextReductionPercent}%`,
      'Latency (ms)': r.latencyMs,
      Passed: r.success
    }))
  );
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
