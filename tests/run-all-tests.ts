/**
 * Unified Test Runner for agentctl-fastpath.
 * Executes unit, contract, security, and end-to-end tests in one command.
 */

import { runUnitTests } from './unit/unit.test.js';
import { runContractTests } from './contract/contract.test.js';
import { runSecurityTests } from './security/security.test.js';
import { runE2ETests } from './e2e/e2e.test.js';

async function runAll() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🧪 AGENTCTL-FASTPATH COMPREHENSIVE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    await runUnitTests();
    console.log();
    await runContractTests();
    console.log();
    await runSecurityTests();
    console.log();
    await runE2ETests();
    console.log();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🎉 ALL TEST SUITES PASSED CLEANLY (100% SUCCESS)');
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  }
}

runAll();
