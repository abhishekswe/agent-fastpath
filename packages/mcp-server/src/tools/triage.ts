/**
 * MCP tool handler for fastpath_triage.
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import {
  CapabilityRouter,
  DeterministicEngine,
  EvaluationStatus,
  FastpathTriageOutput,
  LocalEvidenceStore,
  RankedTriageItem,
  ResultCompactor,
  defaultEvidenceStore,
  defaultMetricsRecorder
} from '@agent-fastpath/core';
import { PolicySchema } from './evaluate.js';

/** Bytes read per file; the judgment call sees the first MAX_JUDGED_CHARS of it. */
const MAX_FILE_BYTES = 64 * 1024;
const MAX_JUDGED_CHARS = 4000;
const CONCURRENCY = 8;

export const FastpathTriageShape = {
  query: z.string().min(1).describe('What you are looking for, e.g. "SSRF protection and IP blocking".'),
  items: z
    .array(
      z.object({
        id: z.string().describe('Your identifier for the item, returned in results'),
        content: z.string().optional().describe('Inline text to judge'),
        path: z.string().optional().describe('File path to read instead of inline content'),
        metadata: z.record(z.unknown()).optional()
      })
    )
    .min(1)
    .max(500)
    .describe('Items to rank. Prefer `path` so file contents never enter your context.'),
  limit: z.number().int().positive().optional().default(10).describe('How many top items to return.'),
  allowedRoots: z
    .array(z.string())
    .optional()
    .describe('Narrow the server roots for this call. Must sit inside the server roots.'),
  policy: PolicySchema.optional(),
  deadlineMs: z.number().int().positive().optional()
};

export const FastpathTriageSchema = z.object(FastpathTriageShape);

type TriageArgs = z.infer<typeof FastpathTriageSchema>;
type Outcome = { ranked?: RankedTriageItem; failure?: { id: string; error: string }; bytes: number };

export async function handleFastpathTriage(
  router: CapabilityRouter,
  args: TriageArgs,
  serverRoots: string[]
): Promise<FastpathTriageOutput> {
  const startTime = Date.now();
  const traceId = LocalEvidenceStore.generateTraceId();
  const roots = DeterministicEngine.narrowRoots(args.allowedRoots, serverRoots);

  const outcomes = await mapLimit(args.items, CONCURRENCY, (item) => triageOne(router, args, item, roots));

  const ranked = outcomes.flatMap((o) => (o.ranked ? [o.ranked] : []));
  const failures = outcomes.flatMap((o) => (o.failure ? [o.failure] : []));
  const readBytes = outcomes.reduce((sum, o) => sum + o.bytes, 0);
  const unseenBytes = args.items.reduce(
    (sum, item, i) => sum + (item.path ? outcomes[i].bytes : 0),
    0
  );

  ranked.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const top = ranked.slice(0, args.limit ?? 10);
  const status = aggregateStatus(top, failures.length === args.items.length);
  const provider = router.getJudgmentProvider();
  const latencyMs = Date.now() - startTime;

  const metrics = ResultCompactor.computeMetrics({
    stateBytes: readBytes,
    unseenBytes,
    response: top,
    latencyMs,
    provider: provider.id,
    decisionPath: status === 'error' || readBytes === 0 ? 'deterministic' : status === 'escalate' ? 'escalation' : 'semantic_jev'
  });

  await defaultEvidenceStore.saveTrace({
    traceId,
    timestamp: new Date().toISOString(),
    tool: 'fastpath_triage',
    status,
    decisionPath: metrics.decisionPath,
    stateSummary: `Triaged ${args.items.length} items for query: "${args.query}"`,
    latencyBreakdownMs: { totalMs: latencyMs },
    redactionsApplied: [],
    diagnostics: { totalEvaluated: args.items.length, failures, roots, ranked },
    estimatedTokensSaved: metrics.estimatedTokensSaved
  });

  defaultMetricsRecorder.record({
    tool: 'fastpath_triage',
    latencyMs,
    status,
    estimatedTokensSaved: metrics.estimatedTokensSaved,
    hostTurnsSaved: 1,
    provider: provider.id,
    decisionPath: metrics.decisionPath
  });

  return {
    status,
    rankedItems: top,
    totalEvaluated: args.items.length,
    skippedCount: failures.length,
    failures,
    traceId,
    metrics
  };
}

async function triageOne(
  router: CapabilityRouter,
  args: TriageArgs,
  item: TriageArgs['items'][number],
  roots: string[]
): Promise<Outcome> {
  let text = item.content ?? '';
  if (item.path) {
    try {
      const canonical = DeterministicEngine.validatePathWithinRoots(item.path, roots);
      const handle = await fs.open(canonical, 'r');
      try {
        const buf = Buffer.alloc(MAX_FILE_BYTES);
        const { bytesRead } = await handle.read(buf, 0, MAX_FILE_BYTES, 0);
        text = buf.subarray(0, bytesRead).toString('utf8');
      } finally {
        await handle.close();
      }
    } catch (err: any) {
      return { failure: { id: item.id, error: err.message }, bytes: 0 };
    }
  }

  if (!text) {
    return { failure: { id: item.id, error: 'Neither content nor a readable path was supplied' }, bytes: 0 };
  }
  const bytes = Buffer.byteLength(text, 'utf8');

  try {
    const res = await router.evaluate({
      state: `Target Document / File ID: ${item.id}\n\n${text.slice(0, MAX_JUDGED_CHARS)}`,
      preset: 'relevance',
      presetParams: { query: args.query },
      policy: args.policy,
      deadlineMs: args.deadlineMs
    });
    const degree = res.answers.relevance_degree;
    const score = degree && 'score' in degree ? degree.score / 3 : 0;
    return {
      bytes,
      ranked: {
        id: item.id,
        status: res.status,
        score: Math.round(score * 1000) / 1000,
        confidence: res.confidence,
        reason: res.reasonCode,
        snippet: ResultCompactor.extractCompactSnippet(DeterministicEngine.redactSecrets(text).redacted, 120),
        metadata: item.metadata
      }
    };
  } catch (err: any) {
    return { failure: { id: item.id, error: err.message }, bytes };
  }
}

/**
 * Accept only when every returned item was judged confidently. If none could be judged
 * (for example, no provider), escalate. Mixed results are a usable ranking to review;
 * each item carries its own status.
 */
function aggregateStatus(top: RankedTriageItem[], allFailed: boolean): EvaluationStatus {
  if (allFailed) return 'error';
  if (top.length === 0) return 'review';
  if (top.every((i) => i.status === 'accept')) return 'accept';
  if (top.every((i) => i.status === 'escalate' || i.status === 'error')) return 'escalate';
  return 'review';
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
