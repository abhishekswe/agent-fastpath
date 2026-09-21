/**
 * MCP tool handler for fastpath_evaluate.
 */
import { z } from 'zod';
import { CapabilityRouter, FastpathEvaluateOutput } from '@agentctl/core';
export declare const FastpathEvaluateSchema: z.ZodObject<{
    state: z.ZodUnion<[z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>]>;
    questions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        type: z.ZodEnum<["choice", "score", "noul"]>;
        instructions: z.ZodString;
        criteria: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>, z.ZodArray<z.ZodString, "many">]>>;
    }, "strip", z.ZodTypeAny, {
        type: "choice" | "score" | "noul";
        instructions: string;
        criteria?: string[] | Record<string, string | null> | undefined;
    }, {
        type: "choice" | "score" | "noul";
        instructions: string;
        criteria?: string[] | Record<string, string | null> | undefined;
    }>>>;
    preset: z.ZodOptional<z.ZodEnum<["relevance", "rank", "classify", "verify_claim", "extract_fields", "compare", "severity", "ambiguity", "intent", "risk", "ship_gate"]>>;
    presetParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    policy: z.ZodOptional<z.ZodObject<{
        confidenceThreshold: z.ZodOptional<z.ZodNumber>;
        minMargin: z.ZodOptional<z.ZodNumber>;
        escalateOnAmbiguity: z.ZodOptional<z.ZodBoolean>;
        maxStateSizeBytes: z.ZodOptional<z.ZodNumber>;
        redactSecrets: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        confidenceThreshold?: number | undefined;
        minMargin?: number | undefined;
        escalateOnAmbiguity?: boolean | undefined;
        maxStateSizeBytes?: number | undefined;
        redactSecrets?: boolean | undefined;
    }, {
        confidenceThreshold?: number | undefined;
        minMargin?: number | undefined;
        escalateOnAmbiguity?: boolean | undefined;
        maxStateSizeBytes?: number | undefined;
        redactSecrets?: boolean | undefined;
    }>>;
    deadlineMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    state: string | Record<string, unknown>;
    questions?: Record<string, {
        type: "choice" | "score" | "noul";
        instructions: string;
        criteria?: string[] | Record<string, string | null> | undefined;
    }> | undefined;
    preset?: "relevance" | "ship_gate" | "rank" | "classify" | "verify_claim" | "extract_fields" | "compare" | "severity" | "ambiguity" | "intent" | "risk" | undefined;
    presetParams?: Record<string, unknown> | undefined;
    policy?: {
        confidenceThreshold?: number | undefined;
        minMargin?: number | undefined;
        escalateOnAmbiguity?: boolean | undefined;
        maxStateSizeBytes?: number | undefined;
        redactSecrets?: boolean | undefined;
    } | undefined;
    deadlineMs?: number | undefined;
}, {
    state: string | Record<string, unknown>;
    questions?: Record<string, {
        type: "choice" | "score" | "noul";
        instructions: string;
        criteria?: string[] | Record<string, string | null> | undefined;
    }> | undefined;
    preset?: "relevance" | "ship_gate" | "rank" | "classify" | "verify_claim" | "extract_fields" | "compare" | "severity" | "ambiguity" | "intent" | "risk" | undefined;
    presetParams?: Record<string, unknown> | undefined;
    policy?: {
        confidenceThreshold?: number | undefined;
        minMargin?: number | undefined;
        escalateOnAmbiguity?: boolean | undefined;
        maxStateSizeBytes?: number | undefined;
        redactSecrets?: boolean | undefined;
    } | undefined;
    deadlineMs?: number | undefined;
}>;
export declare function handleFastpathEvaluate(router: CapabilityRouter, args: z.infer<typeof FastpathEvaluateSchema>): Promise<FastpathEvaluateOutput>;
//# sourceMappingURL=evaluate.d.ts.map