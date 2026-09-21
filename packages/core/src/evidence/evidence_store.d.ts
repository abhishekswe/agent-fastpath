/**
 * In-memory and local disk Evidence Store for opaque trace lookup.
 */
import { EvidenceStore, TraceRecord } from '../contracts/provider.js';
export declare class LocalEvidenceStore implements EvidenceStore {
    private traces;
    private maxTraces;
    constructor(maxTraces?: number);
    static generateTraceId(): string;
    saveTrace(trace: TraceRecord): Promise<void>;
    getTrace(traceId: string): Promise<TraceRecord | null>;
    listRecent(limit?: number): Promise<TraceRecord[]>;
}
export declare const defaultEvidenceStore: LocalEvidenceStore;
//# sourceMappingURL=evidence_store.d.ts.map