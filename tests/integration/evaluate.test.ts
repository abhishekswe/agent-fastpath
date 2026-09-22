import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockTypeSafeProvider, UnavailableJudgmentProvider } from '@agentctl/provider-typesafe';
import { connect, ScriptedProvider } from '../helpers.js';

test('lists exactly the five fastpath tools', async () => {
  const s = await connect({ judgmentProvider: new MockTypeSafeProvider() });
  const { tools } = await s.client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'fastpath_browser', 'fastpath_capabilities', 'fastpath_evaluate', 'fastpath_evidence', 'fastpath_triage'
  ]);
  await s.close();
});

test('clean CI output passes ship_gate deterministically without calling the provider', async () => {
  const provider = new ScriptedProvider({});
  const s = await connect({ judgmentProvider: provider });
  const res = await s.call('fastpath_evaluate', {
    preset: 'ship_gate',
    state: 'Test Suites: 8 passed, 8 total. Tests: 64 passed, 0 failed. Lint: OK.'
  });
  assert.equal(res.status, 'accept');
  assert.equal(res.decision, 'READY_TO_SHIP');
  assert.equal(res.metrics.decisionPath, 'deterministic');
  assert.equal(provider.lastRequest, undefined);
  await s.close();
});

test('without a judgment provider, semantic questions escalate instead of guessing', async () => {
  const s = await connect({ judgmentProvider: new UnavailableJudgmentProvider() });
  const res = await s.call('fastpath_evaluate', { preset: 'severity', state: 'Checkout returns HTTP 500.' });
  assert.equal(res.status, 'escalate');
  assert.equal(res.reasonCode, 'JUDGMENT_PROVIDER_UNAVAILABLE');
  assert.equal(res.recommendedAction, 'fallback_large_model');
  await s.close();
});

test('the default server never falls back to the keyword mock', async () => {
  const s = await connect({ env: {} });
  const caps = await s.call('fastpath_capabilities');
  assert.equal(caps.providers.judgment.id, 'none');
  assert.equal(caps.providers.judgment.available, false);
  await s.close();
});

test('detected contradiction escalates to the user even when the model is confident', async () => {
  const s = await connect({
    judgmentProvider: new ScriptedProvider({
      is_ambiguous: { noul: 0.85, answer: true, confidence: 0.85 },
      ambiguity_type: {
        choice: 'contradictory',
        confidence: 0.93,
        probabilities: { contradictory: 0.93, underspecified: 0.06, missing_context: 0.01, none: 0 }
      }
    })
  });
  const res = await s.call('fastpath_evaluate', {
    preset: 'ambiguity',
    state: 'Update the user record immediately, but defer all database writes until midnight.',
    policy: { confidenceThreshold: 0.95, escalateOnAmbiguity: true }
  });
  assert.equal(res.status, 'escalate');
  assert.equal(res.reasonCode, 'AMBIGUITY_DETECTED');
  assert.equal(res.recommendedAction, 'ask_user');

  const evidence = await s.call('fastpath_evidence', { traceId: res.traceId, detailLevel: 'full' });
  assert.equal(evidence.diagnostics.policy.confidenceThreshold, 0.95);
  assert.ok(evidence.diagnostics.gate, 'trace records the gate decision');
  assert.ok(evidence.questions.is_ambiguous, 'full detail includes the questions');
  await s.close();
});

test('ship_gate keeps NEEDS_REVIEW instead of collapsing it into BLOCKED', async () => {
  const s = await connect({
    judgmentProvider: new ScriptedProvider({
      ship_verdict: {
        choice: 'NEEDS_REVIEW',
        confidence: 0.9,
        probabilities: { NEEDS_REVIEW: 0.9, READY_TO_SHIP: 0.08, BLOCKED: 0.02 }
      }
    })
  });
  const res = await s.call('fastpath_evaluate', { preset: 'ship_gate', state: 'Refactor, no tests were run.' });
  assert.equal(res.decision, 'NEEDS_REVIEW');
  assert.equal(res.reasonCode, 'SHIP_GATE_NEEDS_REVIEW');
  await s.close();
});

test('custom questions return typed answers and redact secrets before the provider sees them', async () => {
  const provider = new ScriptedProvider({
    urgency: { choice: 'sev1_outage', confidence: 0.95, probabilities: { sev1_outage: 0.95, sev2_major: 0.05 } }
  });
  const s = await connect({ judgmentProvider: provider });
  const res = await s.call('fastpath_evaluate', {
    state: 'Webhook 500s. Stripe key sk-proj-' + 'z'.repeat(40),
    questions: {
      urgency: { type: 'choice', instructions: 'Urgency?', criteria: { sev1_outage: 'down', sev2_major: 'degraded' } }
    }
  });
  assert.equal(res.status, 'accept');
  assert.equal(res.decision, 'sev1_outage');
  assert.ok(!String(provider.lastRequest?.state).includes('z'.repeat(40)));
  assert.equal(res.metrics.estimatedTokensSaved, 0, 'inline state is not counted as saved context');
  await s.close();
});

test('rejects malformed questions and oversized state with clear errors', async () => {
  const s = await connect({ judgmentProvider: new MockTypeSafeProvider() });
  const bad = await s.call('fastpath_evaluate', {
    state: 'x',
    questions: { q: { type: 'choice', instructions: 'pick', criteria: { only: 'one option' } } }
  });
  assert.equal(bad.isError, true);
  assert.equal(bad.status, 'blocked');

  const big = await s.call('fastpath_evaluate', { state: 'x'.repeat(300 * 1024), preset: 'relevance' });
  assert.equal(big.isError, true);
  assert.match(big.message, /exceeds maximum limit/);

  const raised = await s.call('fastpath_evaluate', {
    state: 'x'.repeat(300 * 1024),
    preset: 'relevance',
    policy: { maxStateSizeBytes: 10 * 1024 * 1024 }
  });
  assert.equal(raised.isError, true, 'callers cannot raise the server limit');
  await s.close();
});

test('capabilities report the configured limits', async () => {
  const s = await connect({
    judgmentProvider: new MockTypeSafeProvider(),
    config: { allowedOrigins: ['https://example.com'], maxBrowserSteps: 3, allowedRoots: ['/tmp'] }
  });
  const caps = await s.call('fastpath_capabilities');
  assert.deepEqual(caps.limits.allowedBrowserOrigins, ['https://example.com']);
  assert.equal(caps.limits.maxBrowserSteps, 3);
  assert.deepEqual(caps.limits.allowedFilesystemRoots, ['/tmp']);
  assert.equal(caps.security.ssrfProtectionEnabled, true);
  assert.equal(caps.providers.judgment.id, 'typesafe:mock');
  await s.close();
});

test('severity with insufficient info escalates to ask user', async () => {
  const s = await connect({
    judgmentProvider: new ScriptedProvider({
      severity_level: {
        choice: 'insufficient_info',
        confidence: 0.88,
        probabilities: { insufficient_info: 0.88, sev3_minor: 0.08, sev4_cosmetic: 0.04 }
      }
    })
  });
  const res = await s.call('fastpath_evaluate', {
    preset: 'severity',
    state: 'Something seems a bit off with the thing sometimes.'
  });
  assert.equal(res.status, 'escalate');
  assert.equal(res.decision, 'insufficient_info');
  assert.equal(res.reasonCode, 'SEVERITY_INSUFFICIENT_INFO');
  assert.equal(res.recommendedAction, 'ask_user');
  await s.close();
});

test('ambiguity with clear instruction accepts without gating on ambiguity_type', async () => {
  const s = await connect({
    judgmentProvider: new ScriptedProvider({
      is_ambiguous: { noul: 0.05, answer: false, confidence: 0.95 },
      ambiguity_type: {
        choice: 'none',
        confidence: 0.52,
        probabilities: { none: 0.52, missing_context: 0.2, underspecified: 0.18, contradictory: 0.1 }
      }
    })
  });
  const res = await s.call('fastpath_evaluate', {
    preset: 'ambiguity',
    state: 'Rename parse_config to load_config in src/config.rs and update its call sites.'
  });
  assert.equal(res.status, 'accept');
  assert.equal(res.decision, false);
  assert.equal(res.reasonCode, 'SPECIFICATION_CLEAR');
  assert.equal(res.recommendedAction, 'proceed');
  await s.close();
});
