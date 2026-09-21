/**
 * Security Test Suite for agentctl-fastpath (STRIDE & local-first mitigations).
 */
import assert from 'node:assert';
import { CapabilityRouter, DeterministicEngine, PathTraversalError, PolicyBlockedError, StaleObservationError } from '@agentctl/core';
import { BrowserSafety, ObservationTokenManager } from '@agentctl/provider-browser';
import { MockTypeSafeProvider } from '@agentctl/provider-typesafe';
export async function runSecurityTests() {
    console.log('--- Running Security Tests ---');
    const provider = new MockTypeSafeProvider();
    const router = new CapabilityRouter({ judgmentProvider: provider });
    // 1. Path Traversal Protection
    const allowedRoots = ['/Users/abhishek/.gemini/antigravity-ide/scratch'];
    assert.throws(() => DeterministicEngine.validatePathWithinRoots('/etc/passwd', allowedRoots), (err) => err instanceof PathTraversalError, 'Rejects absolute path outside allowed roots');
    assert.throws(() => DeterministicEngine.validatePathWithinRoots('../../../secret.env', allowedRoots), (err) => err instanceof PathTraversalError, 'Rejects relative directory traversal');
    // 2. SSRF Protection (Cloud Metadata & Loopback)
    assert.throws(() => BrowserSafety.validateUrl('http://169.254.169.254/latest/meta-data'), /Access to loopback or private network|cloud metadata service is prohibited/i, 'Blocks AWS/GCP cloud metadata SSRF');
    assert.throws(() => BrowserSafety.validateUrl('http://127.0.0.1:8080/admin'), /Access to loopback or private network/i, 'Blocks localhost loopback navigation');
    assert.throws(() => BrowserSafety.validateUrl('http://10.0.0.1/internal-dashboard'), /Access to loopback or private network/i, 'Blocks private 10.x IP range');
    // 3. Origin Allowlist Enforcement
    assert.throws(() => BrowserSafety.validateUrl('https://malicious-site.com', ['https://example.com']), /Origin .* is not in configured allowedOrigins/i, 'Blocks disallowed external origin');
    // Allowed origin should pass
    assert.doesNotThrow(() => BrowserSafety.validateUrl('https://example.com/checkout', ['https://example.com']), 'Permits allowed origin');
    // 4. Stale Observation Token Enforcement
    const tokenMgr = new ObservationTokenManager();
    const obs1 = tokenMgr.createObservationId();
    tokenMgr.registerElements([
        {
            ref: `${obs1}:1`,
            index: 1,
            tagName: 'BUTTON',
            label: 'Submit'
        }
    ]);
    // Valid target from current observation
    const validTarget = tokenMgr.resolveAndValidateTarget(`${obs1}:1`);
    assert.strictEqual(validTarget.label, 'Submit');
    // Next page observation mutates DOM and generates obs2
    const obs2 = tokenMgr.createObservationId();
    tokenMgr.registerElements([
        {
            ref: `${obs2}:1`,
            index: 1,
            tagName: 'BUTTON',
            label: 'New Submit'
        }
    ]);
    // Old target from obs1 must be rejected
    assert.throws(() => tokenMgr.resolveAndValidateTarget(`${obs1}:1`), (err) => err instanceof StaleObservationError, 'Rejects stale observation reference after DOM mutation');
    // 5. Irreversible Action Identification
    assert.strictEqual(BrowserSafety.isIrreversible('click', { ref: '1', index: 1, tagName: 'BUTTON', label: 'Delete Project' }), true, 'Flags "Delete Project" as irreversible');
    assert.strictEqual(BrowserSafety.isIrreversible('click', { ref: '2', index: 2, tagName: 'BUTTON', label: 'Buy Now' }), true, 'Flags "Buy Now" as irreversible');
    assert.strictEqual(BrowserSafety.isIrreversible('click', { ref: '3', index: 3, tagName: 'BUTTON', label: 'View Profile' }), false, 'Recognizes "View Profile" as safe');
    // 6. Oversized Payload Protection
    const oversizedState = 'x'.repeat(300 * 1024); // 300KB > 256KB default
    await assert.rejects(async () => {
        await router.evaluate({ state: oversizedState, preset: 'relevance' });
    }, (err) => err instanceof PolicyBlockedError, 'Rejects oversized payload beyond maxStateSizeBytes');
    console.log('✅ All Security Tests Passed!');
}
//# sourceMappingURL=security.test.js.map