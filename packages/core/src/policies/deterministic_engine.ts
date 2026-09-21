/**
 * Deterministic Engine: Handles exact computations, schema validation,
 * regex patterns, safety policies, and path validation in pure TypeScript.
 */

import { createHash } from 'crypto';
import { resolve, normalize, isAbsolute } from 'path';
import { existsSync, realpathSync } from 'fs';
import { PathTraversalError, PolicyBlockedError } from '../errors/errors.js';

export interface DeterministicEvaluationResult {
  handled: boolean;
  decision?: string | number | boolean;
  confidence: number;
  reasonCode: string;
  details?: Record<string, unknown>;
}

export class DeterministicEngine {
  /**
   * Evaluates whether a query/state can be fully answered with exact deterministic rules.
   */
  public static evaluateExact(
    state: string | Record<string, unknown>,
    preset?: string,
    params?: Record<string, unknown>
  ): DeterministicEvaluationResult {
    const rawText = typeof state === 'string' ? state : JSON.stringify(state);

    // 1. Ship gate: decide from CI output when it is unambiguous. Any failure
    //    signal wins over a pass signal, so "64 passed" plus "Lint: FAILED" blocks.
    if (preset === 'ship_gate') {
      const failure = SHIP_GATE_FAILURE_PATTERNS.find((p) => p.test(rawText));
      if (failure) {
        return {
          handled: true,
          decision: 'BLOCKED',
          confidence: 1.0,
          reasonCode: 'DETERMINISTIC_TEST_FAILURE_DETECTED',
          details: { matchedPattern: failure.toString() }
        };
      }
      const pass = SHIP_GATE_PASS_PATTERNS.find((p) => p.test(rawText));
      if (pass) {
        return {
          handled: true,
          decision: 'READY_TO_SHIP',
          confidence: 0.99,
          reasonCode: 'DETERMINISTIC_TEST_SUCCESS_VERIFIED',
          details: { matchedPattern: pass.toString() }
        };
      }
    }

    // 2. Risk checks: detecting dangerous shell commands or destructive SQL patterns
    if (preset === 'risk') {
      const destructivePatterns = [
        /\brm\s+-rf\s+(?:\/|\*|~\/|\.\/)/i,
        /\bgit\s+push\s+.*--force\b/i,
        /\bgit\s+reset\s+--hard\b/i,
        /\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i,
        /\bTRUNCATE\s+TABLE\b/i,
        /\bDELETE\s+FROM\s+\w+\s*(?:;|$)(?!.*\bWHERE\b)/i
      ];

      for (const pattern of destructivePatterns) {
        if (pattern.test(rawText)) {
          return {
            handled: true,
            decision: 'HIGH_RISK',
            confidence: 1.0,
            reasonCode: 'DETERMINISTIC_DESTRUCTIVE_PATTERN_DETECTED',
            details: { matchedPattern: pattern.toString() }
          };
        }
      }
    }

    // 3. Severity checks: HTTP 500 status or crash dumps
    if (preset === 'severity') {
      if (/FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed|Out of Memory|SIGSEGV|SIGBUS/i.test(rawText)) {
        return {
          handled: true,
          decision: 'sev1_critical',
          confidence: 1.0,
          reasonCode: 'DETERMINISTIC_CRITICAL_OOM_DETECTED'
        };
      }
    }

    return {
      handled: false,
      confidence: 0,
      reasonCode: 'NO_DETERMINISTIC_MATCH'
    };
  }

  /**
   * Validates and confines filesystem paths to authorized roots.
   * Defends against directory traversal (../) and symlink escaping.
   */
  public static validatePathWithinRoots(
    targetPath: string,
    allowedRoots: string[] = [process.cwd()]
  ): string {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new PathTraversalError('Path is empty or invalid', allowedRoots);
    }

    // Resolve absolute path
    const absPath = isAbsolute(targetPath) ? normalize(targetPath) : resolve(process.cwd(), targetPath);

    // Canonicalize allowed roots
    const canonicalRoots = allowedRoots.map((root) => {
      const r = isAbsolute(root) ? normalize(root) : resolve(process.cwd(), root);
      return existsSync(r) ? realpathSync(r) : r;
    });

    // Check if target file exists and resolve its canonical real path
    let realTarget: string;
    if (existsSync(absPath)) {
      try {
        realTarget = realpathSync(absPath);
      } catch (err) {
        throw new PathTraversalError(absPath, allowedRoots);
      }
    } else {
      realTarget = absPath;
    }

    const isContained = canonicalRoots.some(
      (root) => realTarget === root || realTarget.startsWith(root.endsWith('/') ? root : `${root}/`)
    );

    if (!isContained) {
      throw new PathTraversalError(targetPath, allowedRoots);
    }

    return realTarget;
  }

  /**
   * Fast cryptographic SHA-256 state hashing for caching and deduplication.
   */
  public static hashState(state: string | Record<string, unknown>): string {
    const text = typeof state === 'string' ? state : JSON.stringify(state);
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
  }

  /**
   * Narrows the server's allowed roots to the caller's requested roots.
   * Every requested root must sit inside a server root; callers can never widen access.
   */
  public static narrowRoots(requested: string[] | undefined, serverRoots: string[]): string[] {
    if (!requested || requested.length === 0) return serverRoots;
    return requested.map((root) => this.validatePathWithinRoots(root, serverRoots));
  }

  /**
   * Redacts sensitive secrets, API keys, tokens, and credentials from text strings.
   */
  public static redactSecrets(content: string): { redacted: string; redactions: string[] } {
    const redactions: string[] = [];
    let text = content;

    for (const p of SECRET_PATTERNS) {
      const next = text.replace(p.regex, p.replace);
      if (next !== text) {
        redactions.push(p.name);
        text = next;
      }
    }

    return { redacted: text, redactions };
  }
}

const SHIP_GATE_FAILURE_PATTERNS: RegExp[] = [
  /BUILD FAILED/i,
  /ERR! test failed/i,
  /\bFAIL\s+[\w\-./]+\.(?:test|spec)\./,
  /\b[1-9]\d*\s+(?:failed|failing|errors?)\b/i,
  /\b(?:build|lint|typecheck|type-check|tests?|ci|compile)\s*:\s*(?:failed|failure|error|errored)\b/i
];

const SHIP_GATE_PASS_PATTERNS: RegExp[] = [
  /\b0 failed,\s*[1-9]\d* passed/i,
  /Tests:\s+[1-9]\d* passed,\s+0 failed/i,
  /Tests:\s+[1-9]\d* passed,\s+\d+ total/i,
  /=+\s*[1-9]\d* passed(?:,\s*\d+ (?:skipped|warnings?|deselected))* in [\d.]+s/i
];

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp; replace: string }> = [
  {
    name: 'Private Key Block',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: '[REDACTED_PRIVATE_KEY]'
  },
  {
    name: 'TypeSafe API Key',
    regex: /\b(?:apikey|ts)_[A-Za-z0-9_-]{20,}/g,
    replace: '[REDACTED_TYPESAFE_KEY]'
  },
  {
    name: 'Anthropic API Key',
    regex: /\bsk-ant-[A-Za-z0-9_-]{32,}/g,
    replace: '[REDACTED_ANTHROPIC_KEY]'
  },
  {
    name: 'OpenAI API Key',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g,
    replace: '[REDACTED_OPENAI_KEY]'
  },
  {
    name: 'GitHub Token',
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g,
    replace: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    name: 'AWS Access Key',
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replace: '[REDACTED_AWS_KEY]'
  },
  {
    name: 'Slack Token',
    regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
    replace: '[REDACTED_SLACK_TOKEN]'
  },
  {
    name: 'Generic Bearer Token',
    regex: /Bearer\s+[A-Za-z0-9._~+/-]{24,}=*/gi,
    replace: 'Bearer [REDACTED_TOKEN]'
  },
  {
    name: 'Secret Assignment',
    regex: /(\b[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*=\s*)['"]?[^\s'"]{8,}['"]?/g,
    replace: '$1[REDACTED]'
  },
  {
    name: 'Password Field',
    regex: /("?(?:password|secret|token|apikey|api_key)"?\s*[:=]\s*)"[^"]+"/gi,
    replace: '$1"[REDACTED]"'
  }
];
