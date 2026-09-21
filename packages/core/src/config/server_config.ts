/**
 * Server configuration: security limits owned by the operator, not by tool callers.
 *
 * Environment variables:
 *   FASTPATH_ROOTS                    Path-delimited filesystem roots for triage (default: cwd)
 *   FASTPATH_BROWSER_ORIGINS          Comma-separated navigation allowlist (default: any public origin)
 *   FASTPATH_ALLOW_PRIVATE_NETWORKS   "1" lets the browser reach loopback/private addresses (default: off)
 *   FASTPATH_MAX_BROWSER_STEPS        Step cap per browser session (default: 5)
 *   FASTPATH_MAX_STATE_BYTES          Evaluate state size cap (default: 262144)
 *   FASTPATH_BROWSER_TIMEOUT_MS       Navigation timeout (default: 15000)
 */

import { delimiter, resolve } from 'path';
import { FastpathServerConfig } from '../contracts/types.js';

export const DEFAULT_MAX_STATE_BYTES = 256 * 1024;

export function resolveServerConfig(
  overrides: Partial<FastpathServerConfig> = {},
  env: NodeJS.ProcessEnv = process.env
): FastpathServerConfig {
  return {
    allowedRoots:
      overrides.allowedRoots ?? splitList(env.FASTPATH_ROOTS, delimiter).map((r) => resolve(r)),
    allowedOrigins: overrides.allowedOrigins ?? splitList(env.FASTPATH_BROWSER_ORIGINS, ','),
    allowPrivateNetworks:
      overrides.allowPrivateNetworks ?? env.FASTPATH_ALLOW_PRIVATE_NETWORKS === '1',
    maxBrowserSteps: overrides.maxBrowserSteps ?? positiveInt(env.FASTPATH_MAX_BROWSER_STEPS, 5),
    maxStateSizeBytes:
      overrides.maxStateSizeBytes ?? positiveInt(env.FASTPATH_MAX_STATE_BYTES, DEFAULT_MAX_STATE_BYTES),
    browserTimeoutMs: overrides.browserTimeoutMs ?? positiveInt(env.FASTPATH_BROWSER_TIMEOUT_MS, 15000)
  };
}

/** The roots triage may read when none are configured: the server's working directory. */
export function effectiveRoots(config: FastpathServerConfig): string[] {
  return config.allowedRoots.length > 0 ? config.allowedRoots : [process.cwd()];
}

function splitList(value: string | undefined, sep: string): string[] {
  return (value ?? '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
