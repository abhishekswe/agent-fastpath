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

test('ship_gate: FP1 exact benign states never trigger deterministic test failure', () => {
  const benign = [
    'Added handling so a 401 error from the API surfaces as a typed error. 0 failed, 88 passed.',
    'Regression tests were red first (3 failed) and are green now: 0 failed, 91 passed.',
    'Now retries 3 errors before giving up; covered by tests. 0 failed, 40 passed.',
    'Maps HTTP 500 errors to a retry. All green: 0 failed, 12 passed.',
    'Docs: explain what happens after 2 failed login attempts. No code change.'
  ];
  for (const state of benign) {
    const res = DeterministicEngine.evaluateExact(state, 'ship_gate');
    assert.notEqual(res.reasonCode, 'DETERMINISTIC_TEST_FAILURE_DETECTED', state);
  }
});

test('ship_gate: FP6 diff presence falls through to semantic review even with green test summary', () => {
  const diffWithPassingTests = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -15,3 +15,3 @@
-  verifyJwt(req.headers.authorization);
+  // bypassed jwt check
Tests: 154 passed, 0 failed.`;
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
