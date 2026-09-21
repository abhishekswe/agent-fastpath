/**
 * Capability Router: Routes requests following the core architectural hierarchy:
 * 1. Deterministic code first.
 * 2. TypeSafe System One (Jev) semantic judgment second.
 * 3. Browser provider third (when page state/interaction is requested).
 * 4. Escalation to host agent upon ambiguity, low confidence, or policy block.
 */
import { FastpathEvaluateInput, FastpathEvaluateOutput, FastpathPolicyConfig } from '../contracts/types.js';
import { JudgmentProvider } from '../contracts/provider.js';
export interface CapabilityRouterOptions {
    judgmentProvider: JudgmentProvider;
    defaultPolicy?: FastpathPolicyConfig;
}
export declare class CapabilityRouter {
    private judgmentProvider;
    private defaultPolicy;
    constructor(options: CapabilityRouterOptions);
    /**
     * Main evaluation entrypoint
     */
    evaluate(input: FastpathEvaluateInput): Promise<FastpathEvaluateOutput>;
}
//# sourceMappingURL=capability_router.d.ts.map