/**
 * Shared test helpers. Tests never call the network judgment API: they use the keyword
 * mock or the unavailable provider explicitly.
 */

import http from 'node:http';
import { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FastpathMcpServer, FastpathServerOptions } from '@agentctl/mcp-server';
import { JudgmentProvider, JudgmentRequest, JudgmentResult, TypedAnswer } from '@agentctl/core';

export interface Connected {
  client: Client;
  server: FastpathMcpServer;
  call: (name: string, args?: Record<string, unknown>) => Promise<any>;
  close: () => Promise<void>;
}

/** Connects a real MCP client to a server over an in-memory transport. */
export async function connect(options: FastpathServerOptions = {}): Promise<Connected> {
  const server = new FastpathMcpServer({ env: {}, ...options });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'fastpath-test', version: '1.0.0' });
  await server.getMcpServer().connect(serverTransport);
  await client.connect(clientTransport);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res: any = await client.callTool({ name, arguments: args });
    const body = JSON.parse(res.content[0].text);
    return res.isError ? { isError: true, ...body } : body;
  };
  const close = async () => {
    await client.close();
    await server.close();
  };
  return { client, server, call, close };
}

/** A judgment provider that returns fixed answers, for exercising the gate precisely. */
export class ScriptedProvider implements JudgmentProvider {
  public readonly id = 'scripted';
  public readonly available = true;
  public readonly model = 'scripted';
  public lastRequest?: JudgmentRequest;

  constructor(private readonly answers: Record<string, TypedAnswer>) {}

  public requests: JudgmentRequest[] = [];

  /** Returns the scripted answers for the questions asked; one script can serve several calls. */
  public async evaluate(request: JudgmentRequest): Promise<JudgmentResult> {
    this.lastRequest = request;
    this.requests.push(request);
    const answers: Record<string, TypedAnswer> = {};
    for (const key of Object.keys(request.questions)) {
      if (this.answers[key]) answers[key] = this.answers[key];
    }
    return { answers, latencyMs: 1, model: this.model };
  }

  public async checkHealth() {
    return { healthy: true, latencyMs: 0 };
  }
}

export interface Fixture {
  url: string;
  port: number;
  hits: string[];
  close: () => Promise<void>;
}

/** Local HTTP server for browser tests. `pages` maps paths to HTML. */
export async function startFixture(pages: Record<string, string>): Promise<Fixture> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    const body = pages[req.url ?? '/'];
    if (body === undefined) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
