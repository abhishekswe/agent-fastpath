/**
 * MCP tool handler for fastpath_triage.
 */
import { z } from 'zod';
import { CapabilityRouter, FastpathTriageOutput } from '@agentctl/core';
export declare const FastpathTriageSchema: z.ZodObject<{
    query: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodOptional<z.ZodString>;
        path: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        path?: string | undefined;
        content?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        path?: string | undefined;
        content?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    allowedRoots: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    policy: z.ZodOptional<z.ZodObject<{
        confidenceThreshold: z.ZodOptional<z.ZodNumber>;
        redactSecrets: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        confidenceThreshold?: number | undefined;
        redactSecrets?: boolean | undefined;
    }, {
        confidenceThreshold?: number | undefined;
        redactSecrets?: boolean | undefined;
    }>>;
    deadlineMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    query: string;
    items: {
        id: string;
        path?: string | undefined;
        content?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
    limit: number;
    policy?: {
        confidenceThreshold?: number | undefined;
        redactSecrets?: boolean | undefined;
    } | undefined;
    deadlineMs?: number | undefined;
    allowedRoots?: string[] | undefined;
}, {
    query: string;
    items: {
        id: string;
        path?: string | undefined;
        content?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
    policy?: {
        confidenceThreshold?: number | undefined;
        redactSecrets?: boolean | undefined;
    } | undefined;
    deadlineMs?: number | undefined;
    limit?: number | undefined;
    allowedRoots?: string[] | undefined;
}>;
export declare function handleFastpathTriage(router: CapabilityRouter, args: z.infer<typeof FastpathTriageSchema>): Promise<FastpathTriageOutput>;
//# sourceMappingURL=triage.d.ts.map