/**
 * Real MCP Client Integration Test.
 * Verifies that two different real MCP clients can connect over MCP protocol transports,
 * discover tools, and execute typed operations against agentctl-fastpath.
 */

import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FastpathMcpServer } from '@agentctl/mcp-server';

export async function runRealMcpClientTests(): Promise<void> {
  console.log('--- Running Real MCP Client Integration Tests (2 Clients) ---');

  // Server instance
  const server = new FastpathMcpServer();

  // ==========================================
  // CLIENT 1: Simulating Claude Code
  // ==========================================
  console.log('• Testing Client 1 (Claude Code profile)...');
  const [client1Transport, server1Transport] = InMemoryTransport.createLinkedPair();

  const client1 = new Client(
    { name: 'claude-code-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await server.getMcpServer().connect(server1Transport);
  await client1.connect(client1Transport);

  // 1. Tool discovery
  const toolsResult = await client1.listTools();
  const toolNames = toolsResult.tools.map((t) => t.name);

  assert.ok(toolNames.includes('fastpath_evaluate'), 'Lists fastpath_evaluate');
  assert.ok(toolNames.includes('fastpath_triage'), 'Lists fastpath_triage');
  assert.ok(toolNames.includes('fastpath_browser'), 'Lists fastpath_browser');
  assert.ok(toolNames.includes('fastpath_evidence'), 'Lists fastpath_evidence');
  assert.ok(toolNames.includes('fastpath_capabilities'), 'Lists fastpath_capabilities');
  assert.strictEqual(toolsResult.tools.length, 5, 'Advertises exactly 5 compact tools');

  // 2. Call fastpath_capabilities
  const capRes = await client1.callTool({
    name: 'fastpath_capabilities',
    arguments: {}
  });

  assert.strictEqual((capRes as any).isError, undefined);
  const capData = JSON.parse((capRes as any).content[0].text);
  assert.strictEqual(capData.version, '0.1.0');
  assert.ok(capData.presets.includes('ship_gate'));

  // 3. Call fastpath_evaluate
  const evalRes = await client1.callTool({
    name: 'fastpath_evaluate',
    arguments: {
      state: 'Tests: 42 passed, 0 failed. Clean build.',
      preset: 'ship_gate'
    }
  });

  const evalData = JSON.parse((evalRes as any).content[0].text);
  assert.strictEqual(evalData.status, 'accept');
  assert.strictEqual(evalData.decision, 'READY_TO_SHIP');
  assert.ok(evalData.traceId.startsWith('trc_'));
  assert.ok(evalData.metrics.estimatedTokensSaved > 0);

  console.log('  Client 1 (Claude Code) verified ✅');

  // ==========================================
  // CLIENT 2: Simulating Cursor / OpenCode
  // ==========================================
  console.log('• Testing Client 2 (Cursor profile)...');
  const server2 = new FastpathMcpServer();
  const [client2Transport, server2Transport] = InMemoryTransport.createLinkedPair();

  const client2 = new Client(
    { name: 'cursor-ide-test-client', version: '2.0.0' },
    { capabilities: {} }
  );

  await server2.getMcpServer().connect(server2Transport);
  await client2.connect(client2Transport);

  // 1. Call fastpath_triage
  const triageRes = await client2.callTool({
    name: 'fastpath_triage',
    arguments: {
      query: 'token signature error',
      items: [
        { id: 'auth.ts', content: 'export function verifyToken(token) { checkSignature(token); }' },
        { id: 'styles.css', content: '.button { color: red; }' }
      ],
      limit: 1
    }
  });

  const triageData = JSON.parse((triageRes as any).content[0].text);
  assert.strictEqual(triageData.status, 'accept');
  assert.strictEqual(triageData.rankedItems.length, 1);
  assert.strictEqual(triageData.rankedItems[0].id, 'auth.ts');
  assert.ok(triageData.rankedItems[0].score > 0);

  // 2. Call fastpath_evidence for triage trace
  const evRes = await client2.callTool({
    name: 'fastpath_evidence',
    arguments: {
      traceId: triageData.traceId,
      detailLevel: 'summary'
    }
  });

  const evData = JSON.parse((evRes as any).content[0].text);
  assert.strictEqual(evData.traceId, triageData.traceId);
  assert.strictEqual(evData.tool, 'fastpath_triage');

  await client1.close();
  await client2.close();

  console.log('  Client 2 (Cursor) verified ✅');
  console.log('✅ Real MCP Client Integration Tests Passed (2/2 Clients Verified)!');
}
