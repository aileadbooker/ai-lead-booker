import { LLMDecision, Lead, BusinessConfig, KnowledgeBaseEntry } from '../types';
/**
 * OpenAI LLM Service with mock Y/N flow for testing
 */
export declare class LLMService {
    private openai?;
    constructor();
    /**
     * Main decision method - delegates to mock for now
     */
    getDecision(lead: Lead, conversationHistory: string[], businessConfig: BusinessConfig, knowledgeBase: KnowledgeBaseEntry[], isFollowUp?: boolean, followupCount?: number): Promise<LLMDecision>;
    /**
     * Mock decision with Y/N sales flow using custom pitches from database
     */
    private getMockDecision;
    /**
     * Generate leads using AI knowledge base
     */
    generateLeadList(niche: string, count?: number): Promise<Array<{
        name: string;
        company: string;
        email: string;
    }>>;
}
declare const _default: LLMService;
export default _default;
//# sourceMappingURL=llm-service.d.ts.map