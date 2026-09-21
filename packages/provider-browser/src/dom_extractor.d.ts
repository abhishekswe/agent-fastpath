/**
 * In-browser DOM extraction and element indexing.
 */
import { InteractiveElement } from '@agentctl/core';
export declare class DomExtractor {
    /**
     * Generates a compact formatted table of interactive elements for TypeSafe System One.
     */
    static buildSummaryTable(elements: InteractiveElement[]): string;
    /**
     * Browser-side evaluation script that identifies interactive DOM nodes,
     * stamps them with unique data attributes, and returns structured data.
     */
    static getExtractionScript(obsId: string): string;
}
//# sourceMappingURL=dom_extractor.d.ts.map