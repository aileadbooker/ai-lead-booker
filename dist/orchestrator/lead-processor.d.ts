import { Lead } from '../types';
/**
 * Lead Processor - Main orchestration logic
 * Coordinates: Qualification → Decision → Action
 */
export declare class LeadProcessor {
    /**
     * Process a single lead through the qualification pipeline
     */
    processLead(lead: Lead, isFollowUp?: boolean): Promise<void>;
    /**
     * Execute action based on LLM decision
     */
    private executeAction;
    /**
     * Safely send a response via EmailService
     */
    private sendResponse;
    /**
     * Check for opt-out in latest message
     */
    private checkOptOut;
    /**
     * Get lead by ID
     */
    private getLead;
    private rowToLead;
}
declare const _default: LeadProcessor;
export default _default;
//# sourceMappingURL=lead-processor.d.ts.map