/**
 * Metrics Recorder and aggregator for agentctl-fastpath.
 */
import { MetricsEvent, MetricsSink } from '../contracts/provider.js';
export declare class LocalMetricsRecorder implements MetricsSink {
    private events;
    private totalCalls;
    private totalTokensSaved;
    private totalTurnsSaved;
    private totalLatencyMs;
    private escalations;
    record(event: MetricsEvent): void;
    getAggregate(): {
        totalCalls: number;
        totalTokensSaved: number;
        totalTurnsSaved: number;
        averageLatencyMs: number;
        escalationRate: number;
    };
}
export declare const defaultMetricsRecorder: LocalMetricsRecorder;
//# sourceMappingURL=metrics_recorder.d.ts.map