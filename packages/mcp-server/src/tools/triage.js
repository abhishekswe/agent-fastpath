/**
 * MCP tool handler for fastpath_triage.
 */
import { z } from 'zod';
import { promises as fs } from 'fs';
import { DeterministicEngine, LocalEvidenceStore, ResultCompactor, defaultEvidenceStore, defaultMetricsRecorder } from '@agentctl/core';
export const FastpathTriageSchema = z.object({
    query: z.string().describe('Target search query, issue description, or criteria to rank against'),
    items: z
        .array(z.object({
        id: z.string(),
        content: z.string().optional(),
        path: z.string().optional(),
        metadata: z.record(z.unknown()).optional()
    }))
        .describe('List of items containing inline text content or allowed local file paths'),
    limit: z.number().optional().default(10).describe('Maximum number of top-ranked items to return'),
    allowedRoots: z
        .array(z.string())
        .optional()
        .describe('Configured filesystem roots for file path access'),
    policy: z
        .object({
        confidenceThreshold: z.number().optional(),
        redactSecrets: z.boolean().optional()
    })
        .optional(),
    deadlineMs: z.number().optional()
});
export async function handleFastpathTriage(router, args) {
    const startTime = Date.now();
    const traceId = LocalEvidenceStore.generateTraceId();
    const allowedRoots = args.allowedRoots || [process.cwd()];
    const limit = args.limit || 10;
    const rankedItems = [];
    const failures = [];
    let totalRawBytes = 0;
    for (const item of args.items) {
        let textToEvaluate = item.content || '';
        // If path is supplied, validate path within roots and read file
        if (item.path) {
            try {
                const canonicalPath = DeterministicEngine.validatePathWithinRoots(item.path, allowedRoots);
                const fileData = await fs.readFile(canonicalPath, 'utf8');
                textToEvaluate = fileData.slice(0, 64 * 1024); // Cap each file at 64KB
            }
            catch (err) {
                failures.push({ id: item.id, error: err.message });
                continue;
            }
        }
        if (!textToEvaluate) {
            failures.push({ id: item.id, error: 'Neither content nor valid readable path was supplied' });
            continue;
        }
        totalRawBytes += Buffer.byteLength(textToEvaluate, 'utf8');
        try {
            const evalRes = await router.evaluate({
                state: `Target Document / File ID: ${item.id}\n\n${textToEvaluate.slice(0, 4000)}`,
                preset: 'relevance',
                presetParams: { query: args.query },
                policy: args.policy,
                deadlineMs: args.deadlineMs
            });
            const scoreAns = evalRes.answers.relevance_degree;
            const scoreValue = 'score' in (scoreAns || {}) ? scoreAns.score : 0;
            rankedItems.push({
                id: item.id,
                score: scoreValue / 3.0, // Normalize to [0, 1]
                confidence: evalRes.confidence,
                reason: evalRes.reasonCode,
                snippet: ResultCompactor.extractCompactSnippet(textToEvaluate, 120),
                metadata: item.metadata
            });
        }
        catch (err) {
            failures.push({ id: item.id, error: err.message });
        }
    }
    // Sort descending by score, then by confidence
    rankedItems.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
    const topItems = rankedItems.slice(0, limit);
    const latencyMs = Date.now() - startTime;
    // Compute estimated context tokens saved
    const rawTokens = Math.ceil(totalRawBytes / 4);
    const outputTokens = Math.ceil(JSON.stringify(topItems).length / 4);
    const estimatedTokensSaved = Math.max(0, rawTokens - outputTokens);
    const metrics = {
        latencyMs,
        estimatedTokensSaved,
        hostTurnsSaved: 1,
        provider: 'fastpath_triage',
        stateBytesEvaluated: totalRawBytes,
        decisionPath: 'deterministic'
    };
    await defaultEvidenceStore.saveTrace({
        traceId,
        timestamp: new Date().toISOString(),
        tool: 'fastpath_triage',
        status: 'accept',
        decisionPath: 'triage',
        stateSummary: `Triaged ${args.items.length} items for query: "${args.query}"`,
        latencyBreakdownMs: { totalMs: latencyMs },
        redactionsApplied: [],
        diagnostics: { totalEvaluated: args.items.length, failures: failures.length },
        estimatedTokensSaved
    });
    defaultMetricsRecorder.record({
        tool: 'fastpath_triage',
        latencyMs,
        status: 'accept',
        estimatedTokensSaved,
        hostTurnsSaved: 1,
        provider: 'fastpath_triage',
        decisionPath: 'triage'
    });
    return {
        status: failures.length === args.items.length ? 'error' : 'accept',
        rankedItems: topItems,
        totalEvaluated: args.items.length,
        skippedCount: failures.length,
        failures,
        traceId,
        metrics
    };
}
//# sourceMappingURL=triage.js.map