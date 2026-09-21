/**
 * MCP tool handler for fastpath_browser.
 */
import { z } from 'zod';
import { BrowserProvider, FastpathBrowserOutput } from '@agentctl/core';
export declare const FastpathBrowserSchema: z.ZodObject<{
    mode: z.ZodEnum<["open", "observe", "act", "check", "choose", "run_bounded"]>;
    sessionId: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    action: z.ZodOptional<z.ZodObject<{
        operation: z.ZodEnum<["click", "type", "select", "scroll_down", "scroll_up", "wait"]>;
        targetRef: z.ZodOptional<z.ZodString>;
        textValue: z.ZodOptional<z.ZodString>;
        selectOption: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        operation: "click" | "type" | "select" | "scroll_down" | "scroll_up" | "wait";
        targetRef?: string | undefined;
        textValue?: string | undefined;
        selectOption?: string | undefined;
    }, {
        operation: "click" | "type" | "select" | "scroll_down" | "scroll_up" | "wait";
        targetRef?: string | undefined;
        textValue?: string | undefined;
        selectOption?: string | undefined;
    }>>;
    goal: z.ZodOptional<z.ZodString>;
    assertion: z.ZodOptional<z.ZodString>;
    allowIrreversible: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    bounds: z.ZodOptional<z.ZodObject<{
        maxSteps: z.ZodOptional<z.ZodNumber>;
        timeoutMs: z.ZodOptional<z.ZodNumber>;
        allowedOrigins: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowPrivateNetworks: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        maxSteps?: number | undefined;
        timeoutMs?: number | undefined;
        allowedOrigins?: string[] | undefined;
        allowPrivateNetworks?: boolean | undefined;
    }, {
        maxSteps?: number | undefined;
        timeoutMs?: number | undefined;
        allowedOrigins?: string[] | undefined;
        allowPrivateNetworks?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    mode: "open" | "observe" | "act" | "check" | "choose" | "run_bounded";
    allowIrreversible: boolean;
    sessionId?: string | undefined;
    url?: string | undefined;
    action?: {
        operation: "click" | "type" | "select" | "scroll_down" | "scroll_up" | "wait";
        targetRef?: string | undefined;
        textValue?: string | undefined;
        selectOption?: string | undefined;
    } | undefined;
    goal?: string | undefined;
    assertion?: string | undefined;
    bounds?: {
        maxSteps?: number | undefined;
        timeoutMs?: number | undefined;
        allowedOrigins?: string[] | undefined;
        allowPrivateNetworks?: boolean | undefined;
    } | undefined;
}, {
    mode: "open" | "observe" | "act" | "check" | "choose" | "run_bounded";
    sessionId?: string | undefined;
    url?: string | undefined;
    action?: {
        operation: "click" | "type" | "select" | "scroll_down" | "scroll_up" | "wait";
        targetRef?: string | undefined;
        textValue?: string | undefined;
        selectOption?: string | undefined;
    } | undefined;
    goal?: string | undefined;
    assertion?: string | undefined;
    allowIrreversible?: boolean | undefined;
    bounds?: {
        maxSteps?: number | undefined;
        timeoutMs?: number | undefined;
        allowedOrigins?: string[] | undefined;
        allowPrivateNetworks?: boolean | undefined;
    } | undefined;
}>;
export declare function handleFastpathBrowser(browserProvider: BrowserProvider, args: z.infer<typeof FastpathBrowserSchema>): Promise<FastpathBrowserOutput>;
//# sourceMappingURL=browser.d.ts.map