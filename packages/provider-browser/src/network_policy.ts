/**
 * Network policy for the browser: which destinations a session may reach.
 *
 * Two layers use it:
 *   - `assertNavigationAllowed` checks a URL before navigation (protocol, origin allowlist,
 *     resolved addresses) so the host gets a clear error.
 *   - `EgressProxy` checks every connection the browser makes, including redirects,
 *     subresources, and fetches, against the resolved IP it actually connects to.
 */

import { promises as dns } from 'dns';
import { isIP } from 'net';
import { SessionLimits, SSRFBlockedError } from '@agent-fastpath/core';

export type LookupFn = (hostname: string) => Promise<string[]>;

export const systemLookup: LookupFn = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /^metadata\.google\.internal$/i];

// [network, prefix length]
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved, broadcast
];

/** True when the address is loopback, private, link-local, or otherwise not public. */
export function isNonPublicAddress(address: string): boolean {
  const ip = stripBrackets(address);
  const family = isIP(ip);
  if (family === 4) return isNonPublicV4(ip);
  if (family === 6) return isNonPublicV6(ip);
  return true; // not an IP at all: refuse rather than guess
}

/** Hostname as the network layer sees it: no IPv6 brackets, no trailing dot. */
export function normalizeHostname(hostname: string): string {
  return stripBrackets(hostname).replace(/\.$/, '').toLowerCase();
}

export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return BLOCKED_HOSTNAMES.some((p) => p.test(host));
}

/**
 * Resolves a hostname and returns its addresses, throwing if any is non-public
 * (unless private networks are allowed). Checking every address blocks hosts that
 * mix public and private records.
 */
export async function resolvePublicAddresses(
  hostname: string,
  allowPrivateNetworks: boolean,
  lookup: LookupFn = systemLookup
): Promise<string[]> {
  const host = normalizeHostname(hostname);
  if (!allowPrivateNetworks && isBlockedHostname(host)) {
    throw new Error(`Access to loopback or private network (${host}) is prohibited.`);
  }

  const addresses = isIP(host) ? [host] : await lookup(host);
  if (addresses.length === 0) throw new Error(`Could not resolve ${host}`);

  if (!allowPrivateNetworks) {
    const blocked = addresses.find(isNonPublicAddress);
    if (blocked) {
      throw new Error(`Access to loopback or private network (${blocked}) is prohibited.`);
    }
  }
  return addresses;
}

/** True when the URL's origin is permitted by the allowlist. Empty allowlist permits all. */
export function isOriginAllowed(url: URL, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return true;
  const host = normalizeHostname(url.hostname);
  return allowedOrigins.some((allowed) => {
    if (allowed === url.origin) return true;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(2).toLowerCase();
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return false;
  });
}

/**
 * Validates a navigation target: http(s) only, origin allowlist, and public addresses.
 */
export async function assertNavigationAllowed(
  targetUrl: string,
  limits: Pick<SessionLimits, 'allowedOrigins' | 'allowPrivateNetworks'>,
  lookup: LookupFn = systemLookup
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new SSRFBlockedError(targetUrl, 'Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SSRFBlockedError(targetUrl, `Disallowed protocol: ${parsed.protocol}`);
  }

  if (!isOriginAllowed(parsed, limits.allowedOrigins)) {
    throw new SSRFBlockedError(
      targetUrl,
      `Origin '${parsed.origin}' is not in configured allowedOrigins: ${limits.allowedOrigins.join(', ')}`
    );
  }

  try {
    await resolvePublicAddresses(parsed.hostname, limits.allowPrivateNetworks, lookup);
  } catch (err: any) {
    throw new SSRFBlockedError(targetUrl, err.message);
  }
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isNonPublicV4(ip: string): boolean {
  const value = v4ToInt(ip);
  return BLOCKED_V4.some(([net, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (v4ToInt(net) & mask);
  });
}

function expandV6(ip: string): number[] {
  // Convert an embedded dotted IPv4 tail (::ffff:1.2.3.4) to two hextets first.
  let text = ip.toLowerCase().split('%')[0];
  const v4Tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const n = v4ToInt(v4Tail[1]);
    text = text.slice(0, -v4Tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const parts = tail !== undefined ? [...headParts, ...Array(missing).fill('0'), ...tailParts] : headParts;
  return parts.map((p) => parseInt(p || '0', 16));
}

function isNonPublicV6(ip: string): boolean {
  const h = expandV6(ip);
  const allZeroPrefix = (n: number) => h.slice(0, n).every((x) => x === 0);

  if (allZeroPrefix(8)) return true; // :: unspecified
  if (allZeroPrefix(7) && h[7] === 1) return true; // ::1 loopback
  if (allZeroPrefix(5) && h[5] === 0xffff) return isNonPublicV4(embeddedV4(h)); // ::ffff:a.b.c.d
  if (allZeroPrefix(6)) return isNonPublicV4(embeddedV4(h)); // ::a.b.c.d (deprecated compat)
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) {
    return isNonPublicV4(embeddedV4(h)); // 64:ff9b::/96 NAT64
  }
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  return false;
}

function embeddedV4(h: number[]): string {
  return [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff].join('.');
}
