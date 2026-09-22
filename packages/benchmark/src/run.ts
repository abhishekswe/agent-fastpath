/**
 * Benchmark: measures context avoided and latency on real work, with the real provider.
 *
 *   TYPESAFE_API_KEY=... npm run bench
 *
 * "Host tokens" is what the host agent would read to do the task itself (the file
 * contents or the log). "Fastpath tokens" is the size of the response it reads instead.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { CapabilityRouter, ResultCompactor } from '@agent-fastpath/core';
import { TypeSafeJudgmentProvider } from '@agent-fastpath/provider-typesafe';
import { handleFastpathTriage } from '@agent-fastpath/mcp-server';

const ROOT = resolve(process.cwd());

if (!process.env.TYPESAFE_API_KEY) {
  try {
    process.loadEnvFile(join(ROOT, '.env'));
  } catch {}
}
if (!process.env.TYPESAFE_API_KEY) {
  console.error('The benchmark measures the real provider. Set TYPESAFE_API_KEY.');
  process.exit(1);
}

const router = new CapabilityRouter({ judgmentProvider: new TypeSafeJudgmentProvider() });
const tokens = (s: string) => ResultCompactor.estimateTokens(s);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist') return [];
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

async function triage() {
  const files = sourceFiles(join(ROOT, 'packages'));
  const hostTokens = files.reduce((n, f) => n + tokens(readFileSync(f, 'utf8')), 0);
  const start = Date.now();
  const res = await handleFastpathTriage(
    router,
    {
      query: 'Where is SSRF protection and private network blocking implemented?',
      items: files.map((p) => ({ id: relative(ROOT, p), path: p })),
      limit: 5
    },
    [ROOT]
  );
  return {
    Scenario: `Triage ${files.length} source files`,
    'Host tokens': hostTokens,
    'Fastpath tokens': tokens(JSON.stringify(res)),
    'Latency (ms)': Date.now() - start,
    Result: `${res.status}: ${res.rankedItems[0]?.id ?? 'none'}`
  };
}

async function shipGate(label: string, log: string) {
  const start = Date.now();
  const res = await router.evaluate({ state: log, preset: 'ship_gate' });
  return {
    Scenario: label,
    'Host tokens': tokens(log),
    'Fastpath tokens': tokens(JSON.stringify(res)),
    'Latency (ms)': Date.now() - start,
    Result: `${res.status}: ${res.decision} (${res.metrics.decisionPath})`
  };
}

const passingLog = 'Test Suites: 4 passed, 4 total\nTests: 49 passed, 0 failed\nTime: 2.341 s';
const ambiguousLog =
  'Refactored src/auth/jwt.ts to use verify() instead of decode(). Unit tests were not run; ' +
  'the staging deploy succeeded and a manual login worked.';

const rows = [
  await triage(),
  await shipGate('Ship gate, clean CI log', passingLog),
  await shipGate('Ship gate, no test evidence', ambiguousLog)
];
console.table(rows);
