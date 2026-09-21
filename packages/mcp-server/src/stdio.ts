/**
 * stdio transport entrypoint for agentctl-fastpath MCP server.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FastpathMcpServer } from './server.js';

export async function runStdioServer(): Promise<void> {
  const mcpServer = new FastpathMcpServer();
  const transport = new StdioServerTransport();

  await mcpServer.getMcpServer().connect(transport);

  // Handle clean process shutdown
  process.on('SIGINT', async () => {
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    process.exit(0);
  });
}
