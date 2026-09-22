/**
 * Smoke test of the built npm artifact: spawns `packages/cli/dist/index.js start`
 * over stdio exactly as an MCP client would. Run after `npm run build`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BIN = resolve('packages/cli/dist/index.js');
const PKG = JSON.parse(
  execFileSync('node', ['-p', 'JSON.stringify(require("./packages/cli/package.json"))']).toString()
);
const PKG_VERSION = PKG.version;

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'TYPESAFE_API_KEY' && !k.startsWith('FASTPATH_')) env[k] = v;
  }
  return env;
}

test('the built binary reports its version', () => {
  assert.equal(PKG.name, 'agent-fastpath');
  assert.deepEqual(PKG.bin, { 'agent-fastpath': 'dist/index.js' });
  assert.equal(PKG_VERSION, '0.1.1', 'the release manifest is versioned');
  assert.equal(execFileSync('node', [BIN, '--version']).toString().trim(), PKG_VERSION);
});

test('the built binary prints only the new install configuration', () => {
  const legacyName = ['agentctl', 'fastpath'].join('-');
  for (const target of ['claude-code', 'cursor', 'codex']) {
    const output = execFileSync('node', [BIN, 'install-config', target]).toString();
    assert.match(output, /agent-fastpath/);
    assert.ok(!output.includes(legacyName));
  }
});

test('doctor prints the new install command', () => {
  const output = execFileSync('node', [BIN, 'doctor'], { env: cleanEnv() }).toString();
  assert.match(output, /npx -y agent-fastpath start/);
});

test('the built binary serves MCP over stdio and shuts down cleanly', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fastpath-smoke-'));
  const transport = new StdioClientTransport({ command: 'node', args: [BIN, 'start'], cwd, env: cleanEnv() });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(transport);

  assert.equal(client.getServerVersion()?.name, 'agent-fastpath');

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res: any = await client.callTool({ name, arguments: args });
    return JSON.parse(res.content[0].text);
  };

  const { tools } = await client.listTools();
  assert.equal(tools.length, 5);

  const caps = await call('fastpath_capabilities');
  assert.equal(caps.version, PKG_VERSION);
  assert.equal(caps.providers.judgment.available, false);
  assert.deepEqual(caps.limits.allowedFilesystemRoots.map((r: string) => r.replace('/private', '')), [cwd.replace('/private', '')]);

  const gate = await call('fastpath_evaluate', { preset: 'ship_gate', state: 'Tests: 12 passed, 0 failed' });
  assert.equal(gate.decision, 'READY_TO_SHIP');

  const semantic = await call('fastpath_evaluate', { preset: 'severity', state: 'Checkout is down' });
  assert.equal(semantic.status, 'escalate');
  assert.equal(semantic.reasonCode, 'JUDGMENT_PROVIDER_UNAVAILABLE');

  const pid = transport.pid!;
  await client.close();
  await new Promise((r) => setTimeout(r, 500));
  assert.throws(() => process.kill(pid, 0), 'server process exited after the client closed');
});
