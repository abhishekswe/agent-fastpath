/**
 * Validated preset definitions for common AI coding agent operations.
 */
import { QuestionDef } from '../contracts/types.js';
export interface PresetDefinition {
    name: string;
    description: string;
    buildQuestions: (params?: Record<string, unknown>) => Record<string, QuestionDef>;
    synthesizeDecision?: (answers: Record<string, any>) => {
        decision: string | number | boolean;
        reasonCode: string;
    };
}
export declare const PRESET_REGISTRY: Record<string, PresetDefinition>;
//# sourceMappingURL=presets.d.ts.map