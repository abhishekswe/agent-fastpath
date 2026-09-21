/**
 * Live release check: runs the original six-scenario test plan against the built binary,
 * the real TypeSafe API, and the public internet. Needs TYPESAFE_API_KEY and `npm run build`.
 *
 *   npm run build && npm run test:live
 *
 * Set FASTPATH_BIN to test another binary, such as one installed from the packed tarball.
 */

import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = resolve('.');
if (!process.env.TYPESAFE_API_KEY) {
  try {
    process.loadEnvFile(join(ROOT, '.env'));
  } catch {}
}
if (!process.env.TYPESAFE_API_KEY) {
  console.error('TYPESAFE_API_KEY is required for the live check.');
  process.exit(1);
}

const results: Array<{ name: string; ok: boolean; note: string }> = [];

async function scenario(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
  } catch (err: any) {
    results.push({ name, ok: false, note: err.message.split('\n')[0] });
  }
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const transport = new StdioClientTransport({
  command: 'node',
  args: [process.env.FASTPATH_BIN ?? join(ROOT, 'packages/cli/dist/index.js'), 'start'],
  cwd: ROOT,
  env: { ...(process.env as Record<string, string>), FASTPATH_ROOTS: ROOT }
});
const client = new Client({ name: 'live-check', version: '1.0.0' });
await client.connect(transport);

async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res: any = await client.callTool({ name, arguments: args });
  const body = JSON.parse(res.content[0].text);
  return res.isError ? { isError: true, ...body } : body;
}

await scenario('1. capabilities', async () => {
  const caps = await call('fastpath_capabilities');
  assert.equal(caps.providers.judgment.id, 'typesafe');
  assert.equal(caps.providers.judgment.available, true);
  assert.equal(caps.security.ssrfProtectionEnabled, true);
  return `provider ${caps.providers.judgment.id}, ${caps.presets.length} presets`;
});

await scenario('2a. ship_gate on clean CI log', async () => {
  const res = await call('fastpath_evaluate', {
    preset: 'ship_gate',
    state: 'Test Suites: 8 passed, 8 total. Tests: 64 passed, 0 failed. Lint: OK. Git diff shows clean refactoring with no breaking schema changes.'
  });
  assert.equal(res.decision, 'READY_TO_SHIP');
  assert.equal(res.metrics.decisionPath, 'deterministic');
  return `${res.decision} in ${res.metrics.latencyMs} ms (deterministic)`;
});

await scenario('2b. custom typed questions', async () => {
  const res = await call('fastpath_evaluate', {
    state: 'Our payment webhook endpoint is throwing 500 errors during checkout and users cannot purchase subscriptions.',
    questions: {
      urgency: { type: 'choice', instructions: 'Classify incident urgency.', criteria: { sev1_outage: 'Core revenue flow down', sev2_major: 'Major degradation', sev3_minor: 'Minor issue' } },
      data_loss_risk: { type: 'noul', instructions: 'Is there an immediate risk of persistent database corruption?' },
      customer_impact_score: { type: 'score', instructions: 'Rate customer impact.', criteria: ['negligible', 'moderate', 'severe', 'catastrophic'] }
    }
  });
  assert.equal(res.answers.urgency.choice, 'sev1_outage');
  assert.equal(res.answers.data_loss_risk.answer, false);
  assert.equal(res.answers.customer_impact_score.probabilities.length, 4, 'score distribution is returned');
  return `${res.status}: urgency=${res.answers.urgency.choice}, impact=${res.answers.customer_impact_score.score}, ${res.metrics.latencyMs} ms`;
});

await scenario('3. contradictory requirement escalates', async () => {
  const res = await call('fastpath_evaluate', {
    state: 'The system should update the user record immediately, but also defer all database writes until midnight batch processing.',
    preset: 'ambiguity',
    policy: { confidenceThreshold: 0.95, escalateOnAmbiguity: true }
  });
  assert.equal(res.status, 'escalate');
  assert.equal(res.recommendedAction, 'ask_user');
  const ev = await call('fastpath_evidence', { traceId: res.traceId, detailLevel: 'full' });
  assert.equal(ev.diagnostics.policy.confidenceThreshold, 0.95);
  return `${res.status} (${res.reasonCode}), type=${res.answers.ambiguity_type.choice}`;
});

await scenario('4. triage for SSRF protection', async () => {
  const files = [...tsFiles(join(ROOT, 'packages/core/src')), ...tsFiles(join(ROOT, 'packages/provider-browser/src'))];
  const res = await call('fastpath_triage', {
    query: 'SSRF protection, private network validation, and IP blocking',
    items: files.map((p) => ({ id: relative(ROOT, p), path: p })),
    limit: 3
  });
  const top = res.rankedItems.map((i: any) => i.id);
  assert.ok(
    top.some((id: string) => /network_policy|egress_proxy/.test(id)),
    `expected the network policy in the top 3, got ${top.join(', ')}`
  );
  return `${files.length} files in ${res.metrics.latencyMs} ms, top: ${top.join(', ')}, ~${res.metrics.estimatedTokensSaved} tokens saved`;
});

await scenario('5. bounded browser on example.com', async () => {
  const opened = await call('fastpath_browser', { mode: 'open', url: 'https://example.com' });
  assert.equal(opened.status, 'accept', opened.message);
  const link = opened.observation.elements[0];
  const acted = await call('fastpath_browser', {
    mode: 'act', sessionId: opened.sessionId, action: { operation: 'click', targetRef: link.ref }
  });
  assert.equal(acted.status, 'accept', acted.message);
  assert.match(acted.url, /iana\.org/);
  assert.ok(acted.observation.elements.length > 0, 'IANA page observation has elements');
  const check = await call('fastpath_browser', { mode: 'check', sessionId: opened.sessionId, assertion: 'Example Domains' });
  assert.equal(check.outcome.goalSatisfied, true);
  const loopback = await call('fastpath_browser', { mode: 'open', url: 'http://[::1]:5173/' });
  assert.equal(loopback.errorCode, 'SSRF_PROHIBITED');
  await call('fastpath_browser', { mode: 'close', sessionId: opened.sessionId });
  return `clicked "${link.label}", ${acted.observation.elements.length} elements on IANA page, [::1] blocked`;
});

await scenario('6. risk + ship gate on an audit summary', async () => {
  const risk = await call('fastpath_evaluate', { preset: 'risk', state: 'git push origin main --force' });
  assert.equal(risk.decision, 'HIGH_RISK');
  const gate = await call('fastpath_evaluate', {
    preset: 'ship_gate',
    state: 'Security audit: SSRF guard misses IPv6 loopback; irreversible-action gate is never enforced. No fixes applied yet.'
  });
  assert.notEqual(gate.decision, 'READY_TO_SHIP');
  return `force-push=${risk.decision}; unfixed audit=${gate.decision} (${gate.status})`;
});

await client.close();

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.note}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll live scenarios passed');
process.exit(failed ? 1 : 0);
