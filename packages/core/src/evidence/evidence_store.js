/**
 * In-memory and local disk Evidence Store for opaque trace lookup.
 */
import { randomBytes } from 'crypto';
export class LocalEvidenceStore {
    traces = new Map();
    maxTraces;
    constructor(maxTraces = 500) {
        this.maxTraces = maxTraces;
    }
    static generateTraceId() {
        return `trc_${randomBytes(8).toString('hex')}`;
    }
    async saveTrace(trace) {
        // Ring buffer eviction
        if (this.traces.size >= this.maxTraces) {
            const oldestKey = this.traces.keys().next().value;
            if (oldestKey) {
                this.traces.delete(oldestKey);
            }
        }
        this.traces.set(trace.traceId, trace);
    }
    async getTrace(traceId) {
        return this.traces.get(traceId) || null;
    }
    async listRecent(limit = 20) {
        const all = Array.from(this.traces.values());
        return all.slice(-limit).reverse();
    }
}
export const defaultEvidenceStore = new LocalEvidenceStore();
//# sourceMappingURL=evidence_store.js.map