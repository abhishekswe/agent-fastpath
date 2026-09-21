import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeQuestionBuilder } from '@agentctl/provider-typesafe';

// Shape captured from the live TypeSafe System One API (jev-1.13.0).
const liveResponse = {
  impact: {
    type: 'score',
    score: 2.35,
    confidence: 0.65,
    legend: { '0': 'negligible', '1': 'moderate', '2': 'severe', '3': 'catastrophic' },
    probabilities: { '0': 0.0, '1': 0.0, '2': 0.65, '3': 0.35 }
  },
  loss: { type: 'noul', noul: 0.18 },
  sev: { type: 'choice', choice: 'sev1', confidence: 0.93, probabilities: { sev1: 0.95, sev2: 0.05, sev3: 0.0 } }
};

test('keeps score distributions returned as an object keyed by level', () => {
  const out = TypeSafeQuestionBuilder.normalizeAnswers(liveResponse);
  assert.deepEqual((out.impact as any).probabilities, [0, 0, 0.65, 0.35]);
  assert.equal((out.impact as any).score, 2.35);
});

test('noul confidence is the probability of the reported answer', () => {
  const out = TypeSafeQuestionBuilder.normalizeAnswers({ ...liveResponse, yes: { type: 'noul', noul: 0.85 } });
  assert.equal((out.loss as any).answer, false);
  assert.equal(out.loss.confidence, 0.82);
  assert.equal(out.yes.confidence, 0.85);
});

test('choice answers carry margin and runner-up', () => {
  const out = TypeSafeQuestionBuilder.normalizeAnswers(liveResponse);
  assert.equal((out.sev as any).runnerUp, 'sev2');
  assert.equal((out.sev as any).margin, 0.9);
});
