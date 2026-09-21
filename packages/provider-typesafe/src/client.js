/**
 * TypeSafe System One (Jev) Judgment Provider implementation.
 */
import { ProviderUnavailableError } from '@agentctl/core';
import { TypeSafeQuestionBuilder } from './questions.js';
export class TypeSafeJudgmentProvider {
    id = 'typesafe';
    apiKey;
    endpoint;
    model;
    timeoutMs;
    maxRetries;
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.TYPESAFE_API_KEY || '';
        this.endpoint = options.endpoint || 'https://api.typesafe.ai/v1/systemone';
        this.model = options.model || 'jev-latest';
        this.timeoutMs = options.timeoutMs ?? 5000;
        this.maxRetries = options.maxRetries ?? 2;
    }
    getModelName() {
        return this.model;
    }
    isConfigured() {
        return Boolean(this.apiKey);
    }
    async evaluate(request) {
        if (!this.apiKey) {
            throw new ProviderUnavailableError(this.id, 'TYPESAFE_API_KEY is not set. Provide it in environment or options.');
        }
        const payloadQuestions = TypeSafeQuestionBuilder.buildPayloadQuestions(request.questions);
        const stateStr = typeof request.state === 'string' ? request.state : JSON.stringify(request.state);
        const payload = {
            state: stateStr,
            model: this.model,
            questions: payloadQuestions
        };
        const startTime = Date.now();
        const timeout = request.deadlineMs ? Math.min(request.deadlineMs, this.timeoutMs) : this.timeoutMs;
        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(this.endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                clearTimeout(timer);
                if (!response.ok) {
                    const errBody = await response.text().catch(() => '');
                    throw new Error(`TypeSafe API responded with HTTP ${response.status}: ${errBody}`);
                }
                const data = await response.json();
                const latencyMs = Date.now() - startTime;
                const normalizedAnswers = TypeSafeQuestionBuilder.normalizeAnswers(data.answers || {});
                return {
                    answers: normalizedAnswers,
                    rawUsage: data.usage,
                    latencyMs,
                    model: data.model || this.model
                };
            }
            catch (err) {
                clearTimeout(timer);
                lastError = err;
                if (attempt < this.maxRetries) {
                    // exponential backoff: 100ms, 200ms
                    await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
                }
            }
        }
        throw new ProviderUnavailableError(this.id, lastError?.message || 'Request failed after retries');
    }
    async checkHealth() {
        if (!this.apiKey) {
            return {
                healthy: false,
                latencyMs: 0,
                error: 'Missing TYPESAFE_API_KEY'
            };
        }
        const start = Date.now();
        try {
            const res = await this.evaluate({
                state: 'healthcheck',
                questions: {
                    test: {
                        type: 'noul',
                        instructions: 'Is the service operational?'
                    }
                },
                deadlineMs: 2000
            });
            return { healthy: true, latencyMs: res.latencyMs };
        }
        catch (err) {
            return {
                healthy: false,
                latencyMs: Date.now() - start,
                error: err.message
            };
        }
    }
}
//# sourceMappingURL=client.js.map