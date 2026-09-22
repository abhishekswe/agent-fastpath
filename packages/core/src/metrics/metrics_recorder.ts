/**
 * Metrics Recorder and aggregator for agent-fastpath.
 */

import { MetricsEvent, MetricsSink } from '../contracts/provider.js';

export class LocalMetricsRecorder implements MetricsSink {
  private events: MetricsEvent[] = [];
  private totalCalls = 0;
  private totalTokensSaved = 0;
  private totalTurnsSaved = 0;
  private totalLatencyMs = 0;
  private escalations = 0;

  public record(event: MetricsEvent): void {
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

  public getAggregate(): {
    totalCalls: number;
    totalTokensSaved: number;
    totalTurnsSaved: number;
    averageLatencyMs: number;
    escalationRate: number;
  } {
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
