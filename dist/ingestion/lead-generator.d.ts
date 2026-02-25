import { Lead } from '../types';
/**
 * Robust Lead Generator Orchestrator
 * Maps search niches to real Google pagination states and aggressively fetches until quotas are hit.
 */
export declare class LeadGenerator {
    private nichePages;
    /**
     * Generate leads based on a niche
     * @param niche Target industry/niche (e.g. "Gym Owners")
     * @param count Number of valid, non-duplicate leads to generate
     */
    generateLeads(niche: string, count?: number): Promise<Lead[]>;
}
declare const _default: LeadGenerator;
export default _default;
//# sourceMappingURL=lead-generator.d.ts.map