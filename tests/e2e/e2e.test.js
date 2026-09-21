/**
 * End-to-End Integration Tests for agentctl-fastpath.
 */
import assert from 'node:assert';
import { FastpathMcpServer } from '@agentctl/mcp-server';
import { handleFastpathEvaluate } from '@agentctl/mcp-server';
import { handleFastpathTriage } from '@agentctl/mcp-server';
import { handleFastpathEvidence } from '@agentctl/mcp-server';
export async function runE2ETests() {
    console.log('--- Running End-to-End Integration Tests ---');
    const server = new FastpathMcpServer();
    const router = server.getRouter();
    // 1. Host Agent (Codex/Claude) calls fastpath_evaluate with preset
    const evalRes = await handleFastpathEvaluate(router, {
        state: 'Database connection pool exhausted during peak load. Error: ECONNRESET.',
        preset: 'severity'
    });
    assert.strictEqual(evalRes.status, 'accept');
    assert.ok(evalRes.decision);
    assert.ok(evalRes.traceId.startsWith('trc_'));
    assert.ok(evalRes.metrics.estimatedTokensSaved > 0);
    // 2. Host Agent calls fastpath_triage across items
    const triageRes = await handleFastpathTriage(router, {
        query: 'database connection error',
        items: [
            { id: 'src/db.ts', content: 'export const pool = new Pool();' },
            { id: 'src/auth.ts', content: 'export function login() {}' },
            { id: 'src/config.ts', content: 'export const config = { db: "postgres" };' }
        ],
        limit: 2
    });
    assert.strictEqual(triageRes.status, 'accept');
    assert.strictEqual(triageRes.totalEvaluated, 3);
    assert.strictEqual(triageRes.rankedItems.length, 2);
    assert.ok(triageRes.rankedItems[0].id.includes('db') || triageRes.rankedItems[0].id.includes('config'));
    // 3. Host Agent retrieves expanded evidence using traceId
    const evidenceRes = await handleFastpathEvidence({
        traceId: evalRes.traceId,
        detailLevel: 'full'
    });
    assert.strictEqual(evidenceRes.traceId, evalRes.traceId);
    assert.strictEqual(evidenceRes.tool, 'fastpath_evaluate');
    assert.ok(evidenceRes.answers);
    // 4. Low Confidence Escalation Test
    const uncertainRes = await handleFastpathEvaluate(router, {
        state: 'Maybe this is related or maybe not, highly ambiguous and uncertain statement.',
        preset: 'verify_claim',
        presetParams: { claim: 'definite truth' },
        policy: { confidenceThreshold: 0.95 } // Stringent threshold
    });
    assert.ok(uncertainRes.status === 'review' || uncertainRes.status === 'escalate', 'Low confidence returns control to host agent with review or escalate status');
    console.log('✅ All End-to-End Tests Passed!');
}
//# sourceMappingURL=e2e.test.js.map