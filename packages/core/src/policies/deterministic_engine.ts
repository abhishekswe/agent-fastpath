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

    // 1. Exact Ship Gate Checks: if build/test logs clearly show failure or pass
    if (preset === 'ship_gate') {
      if (/BUILD FAILED|ERR! test failed|FAIL [a-zA-Z0-9_\-./]+\.test\./i.test(rawText)) {
        return {
          handled: true,
          decision: 'BLOCKED',
          confidence: 1.0,
          reasonCode: 'DETERMINISTIC_TEST_FAILURE_DETECTED',
          details: { pattern: 'FAIL/ERR in logs' }
        };
      }
      if (/0 failed, [1-9][0-9]* passed|Tests:\s+[1-9][0-9]* passed,\s+0 failed/i.test(rawText)) {
        return {
          handled: true,
          decision: 'READY_TO_SHIP',
          confidence: 0.99,
          reasonCode: 'DETERMINISTIC_TEST_SUCCESS_VERIFIED',
          details: { pattern: 'All tests passed cleanly' }
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
   * Redacts sensitive secrets, API keys, tokens, and credentials from text strings.
   */
  public static redactSecrets(content: string): { redacted: string; redactions: string[] } {
    const redactions: string[] = [];
    let text = content;

    const secretPatterns: Array<{ name: string; regex: RegExp; replace: string }> = [
      {
        name: 'TypeSafe API Key',
        regex: /(?:ts_[a-zA-Z0-9_-]{20,}|TYPESAFE_API_KEY\s*[=:]\s*['"]?)[a-zA-Z0-9_-]{20,}['"]?/gi,
        replace: '[REDACTED_TYPESAFE_KEY]'
      },
      {
        name: 'OpenAI API Key',
        regex: /sk-(?:proj-)?[a-zA-Z0-9_-]{32,}/g,
        replace: '[REDACTED_OPENAI_KEY]'
      },
      {
        name: 'Anthropic API Key',
        regex: /sk-ant-[a-zA-Z0-9_-]{32,}/g,
        replace: '[REDACTED_ANTHROPIC_KEY]'
      },
      {
        name: 'Generic Bearer Token',
        regex: /Bearer\s+[a-zA-Z0-9._-]{24,}/gi,
        replace: 'Bearer [REDACTED_TOKEN]'
      },
      {
        name: 'Password Field',
        regex: /("?(?:password|secret|token|apikey|api_key)"?\s*[:=]\s*)"[^"]+"/gi,
        replace: '$1"[REDACTED]"'
      }
    ];

    for (const p of secretPatterns) {
      if (p.regex.test(text)) {
        redactions.push(p.name);
        text = text.replace(p.regex, p.replace);
      }
    }

    return { redacted: text, redactions };
  }
}
