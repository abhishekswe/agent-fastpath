import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JudgmentRequest, JudgmentResult } from '@agentctl/core';
import { UnavailableJudgmentProvider } from '@agentctl/provider-typesafe';
import { connect } from '../helpers.js';

/** Scores items by whether they mention "ssrf", with confidence set per item. */
class KeywordProvider {
  public readonly id = 'keyword';
  public readonly available = true;
  public readonly model = 'keyword';
  public calls = 0;
  async evaluate(req: JudgmentRequest): Promise<JudgmentResult> {
    this.calls++;
    const text = String(req.state).toLowerCase();
    const hit = text.includes('ssrf');
    const confidence = text.includes('unsure') ? 0.6 : 0.95;
    return {
      latencyMs: 1,
      model: this.model,
      answers: {
        is_relevant: { noul: hit ? 0.95 : 0.05, answer: hit, confidence },
        relevance_degree: { score: hit ? 3 : 0, confidence, probabilities: [] }
      }
    };
  }
  async checkHealth() {
    return { healthy: true, latencyMs: 0 };
  }
}

function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'fastpath-triage-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

test('ranks files read from disk and counts their contents as saved context', async () => {
  const dir = workspace({
    'safety.ts': '// SSRF guard\n' + 'x'.repeat(8000),
    'util.ts': 'export const add = (a, b) => a + b;',
    'readme.md': 'Project readme'
  });
  const s = await connect({ judgmentProvider: new KeywordProvider() as any, config: { allowedRoots: [dir] } });
  const res = await s.call('fastpath_triage', {
    query: 'SSRF protection',
    items: ['safety.ts', 'util.ts', 'readme.md'].map((f) => ({ id: f, path: join(dir, f) })),
    limit: 2
  });
  assert.equal(res.status, 'accept');
  assert.equal(res.rankedItems[0].id, 'safety.ts');
  assert.equal(res.rankedItems.length, 2);
  assert.ok(res.metrics.estimatedTokensSaved > 1500, 'file bytes the host never read are counted');
  assert.equal(res.metrics.decisionPath, 'semantic_jev');
  await s.close();
});

test('callers cannot read outside the server roots, even by passing their own roots', async () => {
  const dir = workspace({ 'a.ts': 'ssrf' });
  const s = await connect({ judgmentProvider: new KeywordProvider() as any, config: { allowedRoots: [dir] } });

  const widened = await s.call('fastpath_triage', {
    query: 'hosts',
    items: [{ id: 'hosts', path: '/etc/hosts' }],
    allowedRoots: ['/']
  });
  assert.equal(widened.isError, true);
  assert.equal(widened.errorCode, 'PATH_TRAVERSAL_PROHIBITED');

  const outside = await s.call('fastpath_triage', { query: 'hosts', items: [{ id: 'hosts', path: '/etc/hosts' }] });
  assert.equal(outside.status, 'error');
  assert.match(outside.failures[0].error, /prohibited/);
  await s.close();
});

test('snippets are redacted before they reach the host', async () => {
  const s = await connect({ judgmentProvider: new KeywordProvider() as any });
  const key = 'sk-proj-' + 'q'.repeat(40);
  const res = await s.call('fastpath_triage', {
    query: 'ssrf config',
    items: [{ id: 'config', content: `OPENAI_KEY=${key} ssrf settings` }]
  });
  assert.ok(!res.rankedItems[0].snippet.includes(key));
  await s.close();
});

test('status reflects item confidence: mixed results ask for review', async () => {
  const s = await connect({ judgmentProvider: new KeywordProvider() as any });
  const res = await s.call('fastpath_triage', {
    query: 'ssrf',
    items: [
      { id: 'sure', content: 'ssrf guard' },
      { id: 'unsure', content: 'ssrf maybe, unsure' }
    ]
  });
  assert.equal(res.status, 'review');
  assert.deepEqual(res.rankedItems.map((i: any) => i.status).sort(), ['accept', 'review']);
  await s.close();
});

test('evaluates items concurrently', async () => {
  let inFlight = 0;
  let peak = 0;
  const slow = {
    id: 'slow', available: true, model: 'slow',
    async evaluate(): Promise<JudgmentResult> {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      return {
        latencyMs: 30, model: 'slow',
        answers: {
          is_relevant: { noul: 0.9, answer: true, confidence: 0.9 },
          relevance_degree: { score: 2, confidence: 0.9, probabilities: [] }
        }
      };
    },
    async checkHealth() { return { healthy: true, latencyMs: 0 }; }
  };
  const s = await connect({ judgmentProvider: slow as any });
  const items = Array.from({ length: 16 }, (_, i) => ({ id: `f${i}`, content: `file ${i}` }));
  const started = Date.now();
  await s.call('fastpath_triage', { query: 'q', items });
  assert.ok(peak > 1, `peak concurrency ${peak}`);
  assert.ok(Date.now() - started < 16 * 30, 'faster than sequential');
  await s.close();
});

test('without a provider every item escalates and so does the ranking', async () => {
  const s = await connect({ judgmentProvider: new UnavailableJudgmentProvider() });
  const res = await s.call('fastpath_triage', { query: 'q', items: [{ id: 'a', content: 'text' }] });
  assert.equal(res.status, 'escalate');
  await s.close();
});
