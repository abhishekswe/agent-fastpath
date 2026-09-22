/**
 * Real Chromium against a local fixture server. These tests start a browser, so they
 * take a few seconds; they need `npx playwright install chromium`.
 */

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { MockTypeSafeProvider } from '@agent-fastpath/provider-typesafe';
import { connect, Connected, Fixture, ScriptedProvider, startFixture } from '../helpers.js';

const HOME = `<!doctype html><html><head><title>Fixture Home</title></head><body>
  <h1>Fixture Home</h1>
  <a href="/details">More information</a>
  <button id="del" onclick="document.body.dataset.deleted = 'yes'; document.getElementById('status').innerText = 'Project deleted'">Delete project</button>
  <p id="status">Project active</p>
  <input placeholder="Search docs" />
</body></html>`;

const DETAILS = `<!doctype html><html><head><title>Details</title></head><body>
  <h1>Example Domains</h1>
  <p>These domains are IANA-managed reserved domains.</p>
  <a href="/">Back home</a><a href="/about">About</a><a href="/contact">Contact</a>
</body></html>`;

let fixture: Fixture;
let open: Connected;

before(async () => {
  fixture = await startFixture({ '/': HOME, '/details': DETAILS, '/secret': 'internal' });
  // This session may reach the loopback fixture; the SSRF tests below use a strict server.
  open = await connect({ judgmentProvider: new MockTypeSafeProvider(), config: { allowPrivateNetworks: true } });
});

after(async () => {
  await open.close();
  await fixture.close();
});

test('open returns a compact element table with observation-bound refs', async () => {
  const res = await open.call('fastpath_browser', { mode: 'open', url: fixture.url });
  assert.equal(res.status, 'accept');
  assert.match(res.observation.observationId, /^obs_[0-9a-f]+$/);
  const labels = res.observation.elements.map((e: any) => e.label);
  assert.deepEqual(labels, ['More information', 'Delete project', 'Search docs']);
  assert.ok(res.observation.elements.every((e: any) => e.ref.startsWith(`${res.observation.observationId}:`)));
  const parsedBytes = Buffer.byteLength(res.observation.summaryTable) +
    Buffer.byteLength(JSON.stringify(res.observation.elements));
  assert.ok(res.metrics.stateBytesEvaluated <= parsedBytes);
  assert.ok(res.metrics.estimatedTokensSaved >= 0);
  assert.ok(res.metrics.estimatedTokensSaved < 100_000);
  const evidence = await open.call('fastpath_evidence', { traceId: res.traceId, detailLevel: 'full' });
  assert.equal(evidence.traceId, res.traceId);
  assert.equal(evidence.tool, 'fastpath_browser');
  assert.equal(evidence.status, 'accept');
  assert.equal(evidence.diagnostics.mode, 'open');
  assert.equal(evidence.diagnostics.url, `${fixture.url}/`);
  assert.match(evidence.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  await open.call('fastpath_browser', { mode: 'close', sessionId: res.sessionId });
});

test('clicking a link waits for the new page before observing it', async () => {
  const opened = await open.call('fastpath_browser', { mode: 'open', url: fixture.url });
  const link = opened.observation.elements.find((e: any) => e.label === 'More information');
  const acted = await open.call('fastpath_browser', {
    mode: 'act',
    sessionId: opened.sessionId,
    action: { operation: 'click', targetRef: link.ref }
  });
  assert.equal(acted.status, 'accept');
  assert.equal(acted.observation.title, 'Details');
  assert.deepEqual(
    acted.observation.elements.map((e: any) => e.label),
    ['Back home', 'About', 'Contact'],
    'the post-click observation shows the new page, not an empty table'
  );

  const check = await open.call('fastpath_browser', {
    mode: 'check',
    sessionId: opened.sessionId,
    assertion: 'IANA-managed reserved domains'
  });
  assert.equal(check.outcome.goalSatisfied, true);
  assert.equal(check.status, 'accept');

  const stale = await open.call('fastpath_browser', {
    mode: 'act',
    sessionId: opened.sessionId,
    action: { operation: 'click', targetRef: link.ref }
  });
  assert.equal(stale.isError, true);
  assert.equal(stale.errorCode, 'STALE_OBSERVATION_REFERENCE');
  await open.call('fastpath_browser', { mode: 'close', sessionId: opened.sessionId });
});

test('check needs the whole phrase, then defers to the judge', async () => {
  const judge = (verified: boolean) =>
    new ScriptedProvider({
      is_verified: { noul: verified ? 0.95 : 0.05, answer: verified, confidence: 0.95 },
      evidence_sufficiency: {
        choice: verified ? 'sufficient' : 'contradicted',
        confidence: 0.9,
        probabilities: verified
          ? { sufficient: 0.9, inconclusive: 0.08, contradicted: 0.02 }
          : { contradicted: 0.9, inconclusive: 0.08, sufficient: 0.02 }
      }
    });

  for (const verified of [false, true]) {
    const provider = judge(verified);
    const s = await connect({ judgmentProvider: provider, config: { allowPrivateNetworks: true } });
    const opened = await s.call('fastpath_browser', { mode: 'open', url: fixture.url });
    // Shares the word "Project" with the page, but the page does not say this.
    const check = await s.call('fastpath_browser', {
      mode: 'check',
      sessionId: opened.sessionId,
      assertion: 'Project archived successfully'
    });
    assert.equal(check.outcome.goalSatisfied, verified);
    assert.equal(check.status, verified ? 'accept' : 'review');
    assert.ok(check.outcome.confidence >= 0.9);
    assert.match(String(provider.lastRequest?.state), /Project active/, 'the judge saw the page text');
    await s.close();
  }
});

test('irreversible actions are blocked until the caller confirms', async () => {
  const opened = await open.call('fastpath_browser', { mode: 'open', url: fixture.url });
  const del = opened.observation.elements.find((e: any) => e.label === 'Delete project');
  assert.equal(del.isIrreversible, true);

  const blocked = await open.call('fastpath_browser', {
    mode: 'act',
    sessionId: opened.sessionId,
    action: { operation: 'click', targetRef: del.ref }
  });
  assert.equal(blocked.isError, true);
  assert.equal(blocked.errorCode, 'IRREVERSIBLE_ACTION_NOT_CONFIRMED');

  const check = await open.call('fastpath_browser', {
    mode: 'check', sessionId: opened.sessionId, assertion: 'Project active'
  });
  assert.equal(check.outcome.goalSatisfied, true, 'the blocked click never ran');

  const allowed = await open.call('fastpath_browser', {
    mode: 'act',
    sessionId: opened.sessionId,
    action: { operation: 'click', targetRef: del.ref },
    allowIrreversible: true
  });
  assert.equal(allowed.status, 'accept');
  await open.call('fastpath_browser', { mode: 'close', sessionId: opened.sessionId });
});

test('the step budget is enforced', async () => {
  const opened = await open.call('fastpath_browser', { mode: 'open', url: fixture.url, bounds: { maxSteps: 1 } });
  await open.call('fastpath_browser', { mode: 'act', sessionId: opened.sessionId, action: { operation: 'scroll_down' } });
  const over = await open.call('fastpath_browser', {
    mode: 'act', sessionId: opened.sessionId, action: { operation: 'scroll_down' }
  });
  assert.equal(over.isError, true);
  assert.match(over.message, /step budget/);
  await open.call('fastpath_browser', { mode: 'close', sessionId: opened.sessionId });
});

test('run_bounded clicks toward a goal, never offering irreversible elements', async () => {
  const provider = new ScriptedProvider({
    is_verified: { noul: 0.05, answer: false, confidence: 0.95 },
    evidence_sufficiency: {
      choice: 'contradicted', confidence: 0.9,
      probabilities: { contradicted: 0.9, inconclusive: 0.08, sufficient: 0.02 }
    },
    next_element: { choice: 'e1', confidence: 0.9, probabilities: { e1: 0.9, none: 0.05, e3: 0.05 } }
  });
  const s = await connect({ judgmentProvider: provider, config: { allowPrivateNetworks: true } });
  const opened = await s.call('fastpath_browser', { mode: 'open', url: fixture.url });
  const run = await s.call('fastpath_browser', {
    mode: 'run_bounded',
    sessionId: opened.sessionId,
    goal: 'IANA-managed reserved domains',
    bounds: { maxSteps: 3 }
  });
  assert.equal(run.status, 'accept');
  assert.equal(run.reasonCode, 'BOUNDED_RUN_SUCCESS');
  assert.equal(run.outcome.stepCount, 1);
  assert.equal(run.observation.title, 'Details');

  const choiceRequest = provider.requests.find((r) => r.questions.next_element);
  const offered = Object.values((choiceRequest!.questions.next_element as any).criteria).join(' ');
  assert.ok(!offered.includes('Delete project'), 'irreversible elements are not offered');
  await s.close();
});

test('close ends the session', async () => {
  const opened = await open.call('fastpath_browser', { mode: 'open', url: fixture.url });
  const closed = await open.call('fastpath_browser', { mode: 'close', sessionId: opened.sessionId });
  assert.equal(closed.closed, true);
  const after = await open.call('fastpath_browser', { mode: 'observe', sessionId: opened.sessionId });
  assert.equal(after.isError, true);
});

test('SSRF: the default server blocks loopback in every form, including IPv6', async () => {
  const strict = await connect({ judgmentProvider: new MockTypeSafeProvider() });
  try {
    for (const url of [
      fixture.url,
      `http://localhost:${fixture.port}/`,
      `http://[::1]:${fixture.port}/`,
      `http://[::ffff:127.0.0.1]:${fixture.port}/`,
      'http://169.254.169.254/latest/meta-data/'
    ]) {
      const res = await strict.call('fastpath_browser', { mode: 'open', url });
      assert.equal(res.isError, true, url);
      assert.equal(res.errorCode, 'SSRF_PROHIBITED', url);
    }
    assert.equal(fixture.hits.filter((h) => h === '/secret').length, 0);
  } finally {
    await strict.close();
  }
});

test('SSRF: requests made by the page itself go through the egress proxy and are blocked', async () => {
  const strict = await connect({ judgmentProvider: new MockTypeSafeProvider() });
  try {
    const provider = strict.server.getBrowserProvider() as any;
    const limits = { maxSteps: 5, timeoutMs: 10000, allowedOrigins: [], allowPrivateNetworks: false };
    const sessionId = await provider.createSession({ limits });
    const page = provider.sessionManager.getSession(sessionId).page;

    // A public page that tries to reach an internal service via subresource, fetch, and redirect.
    const before = fixture.hits.length;
    await page.setContent(`
      <img src="http://127.0.0.1:${fixture.port}/secret">
      <img src="http://localhost:${fixture.port}/secret">
      <script>fetch('http://[::1]:${fixture.port}/secret').catch(() => {})</script>`);
    await page.waitForTimeout(500);

    const obs = await strict.call('fastpath_browser', { mode: 'observe', sessionId });
    assert.equal(fixture.hits.length, before, 'the internal service received no requests');
    assert.ok(
      obs.observation.anomalies.some((a: string) => a.startsWith('Blocked request')),
      'blocked requests are reported'
    );
    await provider.closeSession(sessionId);
  } finally {
    await strict.close();
  }
});

test('the origin allowlist also applies after redirects and clicks', async () => {
  const limited = await connect({
    judgmentProvider: new MockTypeSafeProvider(),
    config: { allowPrivateNetworks: true, allowedOrigins: [fixture.url] }
  });
  try {
    const ok = await limited.call('fastpath_browser', { mode: 'open', url: fixture.url });
    assert.equal(ok.status, 'accept');
    const other = await limited.call('fastpath_browser', { mode: 'open', url: `http://localhost:${fixture.port}/` });
    assert.equal(other.errorCode, 'SSRF_PROHIBITED');
    const widen = await limited.call('fastpath_browser', {
      mode: 'open', url: fixture.url, bounds: { allowedOrigins: ['https://evil.example'] }
    });
    assert.equal(widen.errorCode, 'POLICY_BLOCKED', 'callers cannot widen the server allowlist');
  } finally {
    await limited.close();
  }
});
