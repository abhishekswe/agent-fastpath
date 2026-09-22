/**
 * stdio transport entrypoint for the agent-fastpath MCP server.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FastpathMcpServer, FastpathServerOptions } from './server.js';

export async function runStdioServer(options: FastpathServerOptions = {}): Promise<void> {
  const mcpServer = new FastpathMcpServer(options);
  const transport = new StdioServerTransport();
  await mcpServer.getMcpServer().connect(transport);

  // MCP clients stop a stdio server by closing stdin or signalling it. Either way,
  // close browser sessions so no Chromium processes are left behind.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await mcpServer.close().catch(() => {});
    process.exit(0);
  };
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
