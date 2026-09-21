/**
 * Question translation and validation for TypeSafe System One API.
 */
import { QuestionDef, TypedAnswer } from '@agentctl/core';
export declare class TypeSafeQuestionBuilder {
    /**
     * Formats internal QuestionDef map into TypeSafe System One request shape.
     */
    static buildPayloadQuestions(questions: Record<string, QuestionDef>): Record<string, any>;
    /**
     * Normalizes raw TypeSafe System One response answers into typed TypedAnswer objects.
     */
    static normalizeAnswers(rawAnswers: Record<string, any>): Record<string, TypedAnswer>;
}
//# sourceMappingURL=questions.d.ts.map