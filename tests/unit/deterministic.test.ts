import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicEngine, PathTraversalError } from '@agentctl/core';

test('ship_gate: any failure signal blocks, even next to passing tests', () => {
  for (const log of [
    'Tests: 5 passed, 5 total. Lint: FAILED',
    'Tests: 1 failed, 5 passed, 6 total',
    'npm test failed: FAIL tests/auth.test.ts',
    'BUILD FAILED in 3s'
  ]) {
    assert.equal(DeterministicEngine.evaluateExact(log, 'ship_gate').decision, 'BLOCKED', log);
  }
});

test('ship_gate: clean runs pass deterministically', () => {
  for (const log of [
    'Test Suites: 8 passed, 8 total. Tests: 64 passed, 0 failed. Lint: OK.',
    'Tests: 15 passed, 15 total',
    '====== 12 passed in 0.41s ======'
  ]) {
    assert.equal(DeterministicEngine.evaluateExact(log, 'ship_gate').decision, 'READY_TO_SHIP', log);
  }
});

test('ship_gate: FP1 benign phrases do not trigger false BLOCKED', () => {
  const benign = [
    'Returns 401 error when auth header is missing',
    'Retries up to 3 errors before timing out',
    'Handles HTTP 500 errors gracefully',
    'Locks account after 2 failed login attempts'
  ];
  for (const text of benign) {
    const res = DeterministicEngine.evaluateExact(text, 'ship_gate');
    assert.equal(res.handled, false, `Should not be handled deterministically: ${text}`);
  }
});

test('ship_gate: FP6 diff presence falls through to semantic review even with green test summary', () => {
  const diffWithPassingTests = `
diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,2 +10,2 @@
-  if (!session) throw new UnauthorizedError();
+  // bypassed auth
Tests: 214 passed, 0 failed
`;
  const res = DeterministicEngine.evaluateExact(diffWithPassingTests, 'ship_gate');
  assert.equal(res.handled, false, 'Should fall through to semantic evaluation when diff is present');
});

test('ship_gate: TDD red-to-green narrative falls through to semantic evaluation', () => {
  const narrative = 'Red phase: Tests: 1 failed. Green phase after fix: Tests: 5 passed, 0 failed';
  const res = DeterministicEngine.evaluateExact(narrative, 'ship_gate');
  assert.equal(res.handled, false, 'Should fall through to semantic evaluation when both fail and 0-failed are present');
});

test('risk: destructive commands are flagged without a model', () => {
  for (const cmd of ['rm -rf /', 'git push origin main --force', 'DROP TABLE users;', 'git reset --hard HEAD~3']) {
    assert.equal(DeterministicEngine.evaluateExact(cmd, 'risk').decision, 'HIGH_RISK', cmd);
  }
});

test('redacts real-world secret formats', () => {
  const secrets = [
    'apikey_0123456789abcdef0123456789abcdef_0123456789',
    'sk-proj-' + 'a'.repeat(40),
    'sk-ant-' + 'b'.repeat(40),
    'ghp_' + 'C'.repeat(36),
    'AKIAABCDEFGHIJKLMNOP',
    'xoxb-1234567890-abcdefghij'
  ];
  for (const secret of secrets) {
    const { redacted } = DeterministicEngine.redactSecrets(`value: ${secret} end`);
    assert.ok(!redacted.includes(secret), `leaked ${secret.slice(0, 8)}`);
  }
  const env = DeterministicEngine.redactSecrets('DB_PASSWORD=hunter2hunter2\n{"password": "x"}');
  assert.ok(!env.redacted.includes('hunter2hunter2'));
  assert.ok(!env.redacted.includes('"x"'));
});

test('leaves ordinary text alone', () => {
  const text = 'The sk-short token and a Bearer abc are fine.';
  assert.equal(DeterministicEngine.redactSecrets(text).redacted, text);
});

test('path confinement rejects traversal and caller attempts to widen roots', () => {
  const roots = [process.cwd()];
  assert.throws(() => DeterministicEngine.validatePathWithinRoots('/etc/passwd', roots), PathTraversalError);
  assert.throws(() => DeterministicEngine.validatePathWithinRoots('../../../secret.env', roots), PathTraversalError);
  assert.throws(() => DeterministicEngine.narrowRoots(['/'], roots), PathTraversalError);
  assert.deepEqual(DeterministicEngine.narrowRoots(undefined, roots), roots);
});
