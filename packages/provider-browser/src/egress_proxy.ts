/**
 * Egress Proxy: a local HTTP proxy the browser is forced through.
 *
 * Every connection (navigations, redirects, subresources, fetch, WebSocket) is resolved
 * here and checked against the network policy. The proxy then connects to the exact
 * address it checked, so a DNS answer cannot change between check and use.
 */

import http from 'http';
import net from 'net';
import { AddressInfo } from 'net';
import { LookupFn, resolvePublicAddresses, systemLookup } from './network_policy.js';

export interface BlockedRequest {
  target: string;
  reason: string;
}

const MAX_BLOCKED_LOG = 20;

export class EgressProxy {
  private readonly server: http.Server;
  private readonly sockets = new Set<net.Socket>();
  private blocked: BlockedRequest[] = [];

  constructor(
    private readonly allowPrivateNetworks: boolean,
    private readonly lookup: LookupFn = systemLookup
  ) {
    this.server = http.createServer((req, res) => void this.handleHttp(req, res));
    this.server.on('connect', (req, socket, head) => void this.handleConnect(req, socket as net.Socket, head));
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
  }

  /** Starts listening on a random loopback port and returns the proxy URL. */
  public async start(): Promise<string> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  public async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Returns and clears the requests blocked since the last call. */
  public drainBlocked(): BlockedRequest[] {
    const out = this.blocked;
    this.blocked = [];
    return out;
  }

  private record(target: string, reason: string): void {
    this.blocked.push({ target, reason });
    if (this.blocked.length > MAX_BLOCKED_LOG) this.blocked.shift();
  }

  private async resolveTarget(hostname: string): Promise<string> {
    const addresses = await resolvePublicAddresses(hostname, this.allowPrivateNetworks, this.lookup);
    return addresses[0];
  }

  /** Plain HTTP: the request line carries an absolute URL. */
  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let target: URL;
    try {
      target = new URL(req.url ?? '');
      if (target.protocol !== 'http:') throw new Error(`Unsupported protocol ${target.protocol}`);
    } catch (err: any) {
      res.writeHead(400).end(`Bad proxy request: ${err.message}`);
      return;
    }

    let address: string;
    try {
      address = await this.resolveTarget(target.hostname);
    } catch (err: any) {
      this.record(target.origin, err.message);
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end(`Blocked by agent-fastpath: ${err.message}`);
      return;
    }

    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];

    const upstream = http.request({
      host: address,
      port: target.port || 80,
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers,
      setHost: false
    });
    upstream.on('response', (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502).end(`Upstream error: ${err.message}`);
      else res.destroy();
    });
    req.pipe(upstream);
  }

  /** HTTPS and WebSocket: CONNECT host:port, then a raw tunnel. */
  private async handleConnect(req: http.IncomingMessage, client: net.Socket, head: Buffer): Promise<void> {
    client.on('error', () => client.destroy());
    const [hostPart, portPart] = splitHostPort(req.url ?? '');

    let address: string;
    try {
      address = await this.resolveTarget(hostPart);
    } catch (err: any) {
      this.record(`${hostPart}:${portPart}`, err.message);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }

    const upstream = net.connect(Number(portPart) || 443, address, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
    client.on('close', () => upstream.destroy());
  }
}

function splitHostPort(authority: string): [string, string] {
  const idx = authority.lastIndexOf(':');
  if (idx === -1 || authority.endsWith(']')) return [authority, '443'];
  return [authority.slice(0, idx), authority.slice(idx + 1)];
}
