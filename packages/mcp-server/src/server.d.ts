/**
 * Transport-independent MCP Server implementation for agentctl-fastpath.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { BrowserProvider, CapabilityRouter, JudgmentProvider } from '@agentctl/core';
export interface FastpathServerOptions {
    judgmentProvider?: JudgmentProvider;
    browserProvider?: BrowserProvider;
    router?: CapabilityRouter;
}
export declare class FastpathMcpServer {
    private server;
    private router;
    private browserProvider;
    private judgmentProvider;
    constructor(options?: FastpathServerOptions);
    getMcpServer(): Server;
    getRouter(): CapabilityRouter;
    getBrowserProvider(): BrowserProvider;
    private setupHandlers;
}
//# sourceMappingURL=server.d.ts.map