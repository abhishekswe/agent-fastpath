/**
 * MCP tool handlers for fastpath_evidence and fastpath_capabilities.
 */
import { z } from 'zod';
import { FastpathCapabilitiesOutput, FastpathEvidenceOutput } from '@agentctl/core';
export declare const FastpathEvidenceSchema: z.ZodObject<{
    traceId: z.ZodString;
    detailLevel: z.ZodDefault<z.ZodOptional<z.ZodEnum<["summary", "full"]>>>;
}, "strip", z.ZodTypeAny, {
    traceId: string;
    detailLevel: "summary" | "full";
}, {
    traceId: string;
    detailLevel?: "summary" | "full" | undefined;
}>;
export declare function handleFastpathEvidence(args: z.infer<typeof FastpathEvidenceSchema>): Promise<FastpathEvidenceOutput>;
export declare const FastpathCapabilitiesSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function handleFastpathCapabilities(): FastpathCapabilitiesOutput;
//# sourceMappingURL=evidence.d.ts.map