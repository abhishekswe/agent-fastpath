/**
 * In-memory and local disk Evidence Store for opaque trace lookup.
 */

import { randomBytes } from 'crypto';
import { EvidenceStore, TraceRecord } from '../contracts/provider.js';

export class LocalEvidenceStore implements EvidenceStore {
  private traces: Map<string, TraceRecord> = new Map();
  private maxTraces: number;

  constructor(maxTraces: number = 500) {
    this.maxTraces = maxTraces;
  }

  public static generateTraceId(): string {
    return `trc_${randomBytes(8).toString('hex')}`;
  }

  public async saveTrace(trace: TraceRecord): Promise<void> {
    // Ring buffer eviction
    if (this.traces.size >= this.maxTraces) {
      const oldestKey = this.traces.keys().next().value;
      if (oldestKey) {
        this.traces.delete(oldestKey);
      }
    }
    this.traces.set(trace.traceId, trace);
  }

  public async getTrace(traceId: string): Promise<TraceRecord | null> {
    return this.traces.get(traceId) || null;
  }

  public async listRecent(limit: number = 20): Promise<TraceRecord[]> {
    const all = Array.from(this.traces.values());
    return all.slice(-limit).reverse();
  }
}

export const defaultEvidenceStore = new LocalEvidenceStore();
