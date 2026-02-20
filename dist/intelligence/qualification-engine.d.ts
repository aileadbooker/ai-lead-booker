import { Lead, LLMDecision } from '../types';
/**
 * Qualification Engine with Required Fields Gating and Policy Validation
 */
export declare class QualificationEngine {
    private llmService;
    constructor();
    /**
     * Main qualification method
     * Returns validated LLM decision with required fields gating
     */
    qualifyLead(lead: Lead, isFollowUp?: boolean): Promise<LLMDecision>;
    /**
     * Validate LLM decision against business rules
     * CRITICAL: Required fields gating, service validation, escalation on fallback
     */
    private validateDecision;
    /**
     * Check if all required fields are present
     */
    private checkRequiredFields;
    /**
     * Validate message content doesn't mention unavailable services
     */
    private validateMessageContent;
    /**
     * Generate message asking for missing fields
     */
    private generateMissingFieldsMessage;
    /**
     * Get business configuration
     */
    private getBusinessConfig;
    /**
     * Get knowledge base entries
     */
    private getKnowledgeBase;
    /**
     * Get conversation history for context
     */
    private getConversationHistory;
}
declare const _default: QualificationEngine;
export default _default;
//# sourceMappingURL=qualification-engine.d.ts.map