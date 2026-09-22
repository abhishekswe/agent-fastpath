import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EscalationGate } from '@agent-fastpath/core';

const choice = (confidence: number, probabilities: Record<string, number>) => ({
  choice: Object.keys(probabilities)[0],
  confidence,
  probabilities
});

test('accepts a confident answer with a clear margin', () => {
  const gate = EscalationGate.evaluate({ q: choice(0.95, { a: 0.95, b: 0.05 }) });
  assert.equal(gate.status, 'accept');
  assert.equal(gate.recommendedAction, 'proceed');
});

test('reviews when the top two options are neck and neck', () => {
  const gate = EscalationGate.evaluate({ q: choice(0.85, { a: 0.51, b: 0.49 }) });
  assert.equal(gate.status, 'review');
  assert.equal(gate.reasonCode, 'MARGIN_BELOW_THRESHOLD_AMBIGUITY');
});

test('escalates below the escalation threshold', () => {
  const gate = EscalationGate.evaluate({ q: choice(0.45, { a: 0.45, b: 0.35, c: 0.2 }) });
  assert.equal(gate.status, 'escalate');
});

test('escalationThreshold is configurable, so a strict caller can force escalation', () => {
  const answers = { q: choice(0.7, { a: 0.9, b: 0.1 }) };
  assert.equal(EscalationGate.evaluate(answers, { confidenceThreshold: 0.95 }).status, 'review');
  assert.equal(
    EscalationGate.evaluate(answers, { confidenceThreshold: 0.95, escalationThreshold: 0.9 }).status,
    'escalate'
  );
});

test('escalationThreshold never exceeds confidenceThreshold', () => {
  const answers = { q: choice(0.6, { a: 0.9, b: 0.1 }) };
  const gate = EscalationGate.evaluate(answers, { confidenceThreshold: 0.5, escalationThreshold: 0.9 });
  assert.equal(gate.status, 'accept');
});

test('escalates when there are no answers', () => {
  assert.equal(EscalationGate.evaluate({}).status, 'escalate');
});
