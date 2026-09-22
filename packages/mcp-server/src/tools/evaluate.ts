/**
 * MCP tool handler for fastpath_evaluate.
 */

import { z } from 'zod';
import {
  CapabilityRouter,
  FastpathEvaluateInput,
  FastpathEvaluateOutput,
  PRESET_REGISTRY
} from '@agent-fastpath/core';

const PRESET_NAMES = Object.keys(PRESET_REGISTRY) as [string, ...string[]];

export const QuestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    instructions: z.string().min(1).describe('What to decide'),
    criteria: z
      .record(z.string().nullable())
      .describe('Options as {option_key: "what this option means"}. At least 2.')
  }),
  z.object({
    type: z.literal('score'),
    instructions: z.string().min(1).describe('What to rate'),
    criteria: z.array(z.string()).min(2).describe('Ordered levels, lowest first. Score is 0-based.')
  }),
  z.object({
    type: z.literal('noul'),
    instructions: z.string().min(1).describe('A yes/no question. Answer is P(yes).')
  })
]);

export const PolicySchema = z
  .object({
    confidenceThreshold: z.number().min(0).max(1).optional().describe('Minimum confidence to accept. Default 0.75.'),
    escalationThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Below this confidence, escalate instead of review. Default 0.55.'),
    minMargin: z.number().min(0).max(1).optional().describe('Minimum top-vs-runner-up probability gap. Default 0.15.'),
    escalateOnAmbiguity: z.boolean().optional().describe('Escalate when ambiguity is detected. Default true.'),
    maxStateSizeBytes: z.number().int().positive().optional().describe('Lower the state size limit for this call.')
  })
  .strict();

export const FastpathEvaluateShape = {
  state: z
    .union([z.string(), z.record(z.unknown())])
    .describe('The text or JSON to judge: a log, diff, message, requirement, or document.'),
  preset: z
    .enum(PRESET_NAMES)
    .optional()
    .describe('A built-in question set. Provide this or `questions`.'),
  presetParams: z
    .record(z.unknown())
    .optional()
    .describe('Preset inputs, e.g. {query} for relevance, {claim} for verify_claim, {categories} for classify.'),
  questions: z
    .record(QuestionSchema)
    .optional()
    .describe('Custom typed questions keyed by name. Ignored when `preset` is set.'),
  policy: PolicySchema.optional().describe('Tune how strict the confidence gate is.'),
  deadlineMs: z.number().int().positive().optional().describe('Timeout for the judgment call.')
};

export const FastpathEvaluateSchema = z.object(FastpathEvaluateShape);

export async function handleFastpathEvaluate(
  router: CapabilityRouter,
  args: z.infer<typeof FastpathEvaluateSchema>
): Promise<FastpathEvaluateOutput> {
  return router.evaluate(args as FastpathEvaluateInput);
}
