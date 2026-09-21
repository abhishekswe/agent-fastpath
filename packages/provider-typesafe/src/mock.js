/**
 * Deterministic Mock TypeSafe Provider for offline testing, benchmarks, and CI.
 */
export class MockTypeSafeProvider {
    id = 'typesafe:mock';
    async evaluate(request) {
        const startTime = Date.now();
        const stateStr = typeof request.state === 'string' ? request.state : JSON.stringify(request.state);
        const answers = {};
        for (const [key, q] of Object.entries(request.questions)) {
            if (q.type === 'choice') {
                const optionKeys = Object.keys(q.criteria);
                let selected = optionKeys[0] || 'none';
                // Context-aware selection heuristics for testing
                if (/relevance|match|relate/i.test(key)) {
                    selected = optionKeys.find((o) => /relevant|match|high/i.test(o)) || selected;
                }
                else if (/category|type/i.test(key)) {
                    if (/bug|fix|defect/i.test(stateStr))
                        selected = 'bugfix';
                    else if (/feat|new|add/i.test(stateStr))
                        selected = 'feature';
                    else if (/doc|readme/i.test(stateStr))
                        selected = 'docs';
                    else if (/test/i.test(stateStr))
                        selected = 'test';
                    else
                        selected = optionKeys[0];
                }
                else if (/ship_verdict/i.test(key)) {
                    if (/fail|error|break/i.test(stateStr))
                        selected = 'BLOCKED';
                    else
                        selected = 'READY_TO_SHIP';
                }
                const probabilities = {};
                const remainingProb = 0.08 / Math.max(1, optionKeys.length - 1);
                for (const opt of optionKeys) {
                    probabilities[opt] = opt === selected ? 0.92 : Number(remainingProb.toFixed(3));
                }
                answers[key] = {
                    choice: selected,
                    confidence: 0.92,
                    probabilities,
                    margin: 0.84,
                    runnerUp: optionKeys.find((o) => o !== selected)
                };
            }
            else if (q.type === 'score') {
                const levelCount = q.criteria.length;
                let score = Math.min(2, levelCount - 1);
                if (/urgent|critical|sev1|high/i.test(stateStr)) {
                    score = levelCount - 1;
                }
                else if (/minor|low|sev4/i.test(stateStr)) {
                    score = 0;
                }
                const probabilities = new Array(levelCount).fill(0.05);
                probabilities[score] = 0.85;
                answers[key] = {
                    score,
                    confidence: 0.85,
                    probabilities
                };
            }
            else if (q.type === 'noul') {
                let pYes = 0.88;
                if (/fail|not|never|false|unverified/i.test(stateStr)) {
                    pYes = 0.12;
                }
                else if (/ambiguous|uncertain/i.test(stateStr)) {
                    pYes = 0.52; // Triggers review/escalate on uncertainty
                }
                answers[key] = {
                    noul: pYes,
                    answer: pYes >= 0.5,
                    confidence: Math.round(Math.abs(pYes - 0.5) * 2 * 100) / 100
                };
            }
        }
        const latencyMs = Math.max(2, Date.now() - startTime);
        return {
            answers,
            latencyMs,
            model: 'mock-jev-v1',
            rawUsage: { inputTokens: 42, outputTokens: 18 }
        };
    }
    async checkHealth() {
        return { healthy: true, latencyMs: 1 };
    }
}
//# sourceMappingURL=mock.js.map