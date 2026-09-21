/**
 * MCP tool handler for fastpath_evaluate.
 */
import { z } from 'zod';
export const FastpathEvaluateSchema = z.object({
    state: z.union([z.string(), z.record(z.unknown())]).describe('State text or structured JSON context to evaluate'),
    questions: z
        .record(z.object({
        type: z.enum(['choice', 'score', 'noul']),
        instructions: z.string(),
        criteria: z.union([z.record(z.string().nullable()), z.array(z.string())]).optional()
    }))
        .optional()
        .describe('Map of typed questions (choice, score, noul)'),
    preset: z
        .enum([
        'relevance',
        'rank',
        'classify',
        'verify_claim',
        'extract_fields',
        'compare',
        'severity',
        'ambiguity',
        'intent',
        'risk',
        'ship_gate'
    ])
        .optional()
        .describe('Standard validated preset name'),
    presetParams: z.record(z.unknown()).optional().describe('Parameters for the chosen preset'),
    policy: z
        .object({
        confidenceThreshold: z.number().optional(),
        minMargin: z.number().optional(),
        escalateOnAmbiguity: z.boolean().optional(),
        maxStateSizeBytes: z.number().optional(),
        redactSecrets: z.boolean().optional()
    })
        .optional()
        .describe('Optional threshold and policy overrides'),
    deadlineMs: z.number().optional().describe('Bounded execution deadline in milliseconds')
});
export async function handleFastpathEvaluate(router, args) {
    return await router.evaluate(args);
}
//# sourceMappingURL=evaluate.js.map