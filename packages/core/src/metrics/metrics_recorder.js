/**
 * Metrics Recorder and aggregator for agentctl-fastpath.
 */
export class LocalMetricsRecorder {
    events = [];
    totalCalls = 0;
    totalTokensSaved = 0;
    totalTurnsSaved = 0;
    totalLatencyMs = 0;
    escalations = 0;
    record(event) {
        this.events.push(event);
        this.totalCalls++;
        this.totalTokensSaved += event.estimatedTokensSaved;
        this.totalTurnsSaved += event.hostTurnsSaved;
        this.totalLatencyMs += event.latencyMs;
        if (event.status === 'escalate' || event.decisionPath === 'escalation') {
            this.escalations++;
        }
        if (this.events.length > 2000) {
            this.events.shift();
        }
    }
    getAggregate() {
        return {
            totalCalls: this.totalCalls,
            totalTokensSaved: this.totalTokensSaved,
            totalTurnsSaved: this.totalTurnsSaved,
            averageLatencyMs: this.totalCalls > 0 ? Math.round(this.totalLatencyMs / this.totalCalls) : 0,
            escalationRate: this.totalCalls > 0 ? Math.round((this.escalations / this.totalCalls) * 100) / 100 : 0
        };
    }
}
export const defaultMetricsRecorder = new LocalMetricsRecorder();
//# sourceMappingURL=metrics_recorder.js.map