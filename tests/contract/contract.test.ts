/**
 * Contract Test Suite for MCP Server.
 */

import assert from 'node:assert';
import { FastpathMcpServer } from '@agentctl/mcp-server';
import { MockTypeSafeProvider } from '@agentctl/provider-typesafe';

export async function runContractTests(): Promise<void> {
  console.log('--- Running Contract Tests ---');

  const customMock = new MockTypeSafeProvider();
  const server = new FastpathMcpServer({ judgmentProvider: customMock });

  const mcp = server.getMcpServer();
  assert.ok(mcp, 'MCP Server instance created cleanly');

  // Verify Provider Substitution
  assert.strictEqual(server.getRouter()['judgmentProvider'].id, 'typesafe:mock');

  // Verify Capabilities tool
  const capabilities = await server.getRouter().evaluate({
    state: 'capabilities check',
    preset: 'relevance',
    presetParams: { query: 'test' }
  });
  assert.ok(capabilities.traceId.startsWith('trc_'), 'Generates valid traceId');
  assert.ok(capabilities.metrics.latencyMs >= 0, 'Records non-negative latency');

  console.log('✅ All Contract Tests Passed!');
}
