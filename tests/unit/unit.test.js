/**
 * Unit Test Suite for agentctl-fastpath.
 */
import assert from 'node:assert';
import { CapabilityRouter, DeterministicEngine, EscalationGate, ResultCompactor, PRESET_REGISTRY } from '@agentctl/core';
import { MockTypeSafeProvider, TypeSafeQuestionBuilder } from '@agentctl/provider-typesafe';
export async function runUnitTests() {
    console.log('--- Running Unit Tests ---');
    const provider = new MockTypeSafeProvider();
    const router = new CapabilityRouter({ judgmentProvider: provider });
    // 1. Schema & Presets
    assert.ok(PRESET_REGISTRY.ship_gate, 'ship_gate preset exists');
    assert.ok(PRESET_REGISTRY.relevance, 'relevance preset exists');
    assert.ok(PRESET_REGISTRY.risk, 'risk preset exists');
    // 2. Deterministic Engine: Test failure detection
    const failureState = 'npm test failed: FAIL tests/auth.test.ts (2 failed)';
    const detFail = DeterministicEngine.evaluateExact(failureState, 'ship_gate');
    assert.strictEqual(detFail.handled, true, 'Deterministic engine handles test failure');
    assert.strictEqual(detFail.decision, 'BLOCKED', 'Blocks on test failure');
    assert.strictEqual(detFail.confidence, 1.0, 'Confidence is 1.0 for exact failure');
    // 3. Deterministic Engine: Clean test pass detection
    const passState = 'Tests: 15 passed, 0 failed, 15 total';
    const detPass = DeterministicEngine.evaluateExact(passState, 'ship_gate');
    assert.strictEqual(detPass.handled, true, 'Deterministic engine handles test pass');
    assert.strictEqual(detPass.decision, 'READY_TO_SHIP', 'Decides ready to ship on clean pass');
    // 4. Deterministic Engine: Destructive command detection
    const dangerousCmd = 'rm -rf /';
    const detRisk = DeterministicEngine.evaluateExact(dangerousCmd, 'risk');
    assert.strictEqual(detRisk.handled, true, 'Destructive command detected deterministically');
    assert.strictEqual(detRisk.decision, 'HIGH_RISK', 'High risk assigned');
    // 5. Secret Redaction
    const textWithSecrets = 'My key is sk-proj-1234567890abcdef1234567890abcdef and password: "supersecretpassword"';
    const redacted = DeterministicEngine.redactSecrets(textWithSecrets);
    assert.ok(!redacted.redacted.includes('1234567890abcdef'), 'API key was redacted');
    assert.ok(!redacted.redacted.includes('supersecretpassword'), 'Password was redacted');
    assert.ok(redacted.redactions.length >= 2, 'Recorded all redaction types');
    // 6. Escalation Gate: High confidence -> Accept
    const acceptGate = EscalationGate.evaluate({
        q1: {
            choice: 'optA',
            confidence: 0.95,
            probabilities: { optA: 0.95, optB: 0.05 }
        }
    });
    assert.strictEqual(acceptGate.status, 'accept', 'High confidence is accepted');
    // 7. Escalation Gate: Low margin / ambiguity -> Review
    const reviewGate = EscalationGate.evaluate({
        q1: {
            choice: 'optA',
            confidence: 0.85,
            probabilities: { optA: 0.51, optB: 0.49 } // margin 0.02 < 0.15
        }
    });
    assert.strictEqual(reviewGate.status, 'review', 'Narrow margin triggers review');
    // 8. Escalation Gate: Low confidence -> Escalate
    const escalateGate = EscalationGate.evaluate({
        q1: {
            choice: 'optA',
            confidence: 0.45,
            probabilities: { optA: 0.45, optB: 0.35, optC: 0.2 }
        }
    });
    assert.strictEqual(escalateGate.status, 'escalate', 'Low confidence escalates');
    // 9. Compaction & Token estimation
    const tokensEst = ResultCompactor.estimateTokens('1234567890123456');
    assert.strictEqual(tokensEst, 4, '16 chars estimates to ~4 tokens');
    // 10. Provider normalization
    const normalized = TypeSafeQuestionBuilder.normalizeAnswers({
        testChoice: {
            choice: 'yes',
            confidence: 0.9,
            probabilities: { yes: 0.9, no: 0.1 }
        },
        testNoul: {
            noul: 0.85
        }
    });
    assert.strictEqual(normalized.testChoice.confidence, 0.9);
    assert.strictEqual(normalized.testNoul.answer, true);
    console.log('✅ All Unit Tests Passed!');
}
//# sourceMappingURL=unit.test.js.map