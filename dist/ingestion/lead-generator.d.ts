import { Lead } from '../types';
/**
 * Mock Lead Generator
 * Simulates scraping leads from external sources
 */
export declare class LeadGenerator {
    /**
     * Generate leads based on a niche
     * @param niche Target industry/niche (e.g. "Gym Owners")
     * @param count Number of leads to generate
     */
    /**
     * Generate leads based on a niche
     * @param niche Target industry/niche (e.g. "Gym Owners")
     * @param count Number of leads to generate
     */
    generateLeads(niche: string, count?: number): Promise<Lead[]>;
}
declare const _default: LeadGenerator;
export default _default;
//# sourceMappingURL=lead-generator.d.ts.map