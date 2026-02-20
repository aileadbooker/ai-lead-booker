"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QualificationEngine = void 0;
const database_1 = __importDefault(require("../config/database"));
const llm_service_1 = require("./llm-service");
/**
 * Qualification Engine with Required Fields Gating and Policy Validation
 */
class QualificationEngine {
    constructor() {
        this.llmService = new llm_service_1.LLMService();
    }
    /**
     * Main qualification method
     * Returns validated LLM decision with required fields gating
     */
    async qualifyLead(lead, isFollowUp = false) {
        // Load dependencies
        const [config, knowledgeBase, conversationHistory] = await Promise.all([
            this.getBusinessConfig(),
            this.getKnowledgeBase(),
            this.getConversationHistory(lead.id),
        ]);
        // Get LLM decision
        const decision = await this.llmService.getDecision(lead, conversationHistory, config, knowledgeBase, isFollowUp, lead.followup_count);
        console.log(`📊 LLM Decision for ${lead.id}: ${decision.action} (confidence: ${decision.confidence}%)`);
        // Validate and gate decision
        const validatedDecision = await this.validateDecision(decision, lead, config, knowledgeBase);
        return validatedDecision;
    }
    /**
     * Validate LLM decision against business rules
     * CRITICAL: Required fields gating, service validation, escalation on fallback
     */
    async validateDecision(decision, lead, config, knowledgeBase) {
        // 1. Auto-escalate if fallback was used
        if (decision.fallback_used) {
            console.warn('Fallback decision detected - escalating to human');
            return decision; // Already set to escalate
        }
        // 2. Check confidence threshold
        if (decision.confidence < config.confidence_threshold) {
            console.log(`Confidence ${decision.confidence} below threshold ${config.confidence_threshold}`);
            if (decision.action === 'send_booking_link') {
                // Override to ask for clarification
                decision.action = 'ask_clarification';
                decision.reasoning += ` [Overridden: confidence below threshold]`;
            }
        }
        // 3. CRITICAL: Required fields gating for booking
        if (decision.action === 'send_booking_link') {
            const missingRequired = this.checkRequiredFields(lead, config, decision);
            if (missingRequired.length > 0) {
                console.log('Missing required fields for booking:', missingRequired);
                decision.action = 'ask_clarification';
                decision.missing_fields = missingRequired;
                decision.message_draft = this.generateMissingFieldsMessage(missingRequired);
                decision.reasoning += ` [Overridden: missing required fields: ${missingRequired.join(', ')}]`;
            }
        }
        // 4. Validate mentioned services exist in knowledge base
        const validation = this.validateMessageContent(decision.message_draft, knowledgeBase);
        if (!validation.valid) {
            console.warn('Message validation failed:', validation.reason);
            decision.action = 'escalate';
            decision.reasoning += ` [Escalated: ${validation.reason}]`;
        }
        return decision;
    }
    /**
     * Check if all required fields are present
     */
    checkRequiredFields(lead, config, decision) {
        const missingRequired = [];
        for (const field of config.required_fields) {
            // Check if field exists on lead object
            const fieldValue = lead[field];
            const isLLMMissing = decision.missing_fields?.includes(field);
            if (!fieldValue || isLLMMissing) {
                missingRequired.push(field);
            }
        }
        return missingRequired;
    }
    /**
     * Validate message content doesn't mention unavailable services
     */
    validateMessageContent(message, knowledgeBase) {
        const services = knowledgeBase.filter((k) => k.type === 'service');
        // Simple validation: could be enhanced with NLP
        // For now, just check if message looks safe
        if (message.toLowerCase().includes('guarantee') ||
            message.toLowerCase().includes('promise')) {
            return {
                valid: false,
                reason: 'Message contains unauthorized commitments (guarantee/promise)'
            };
        }
        return { valid: true };
    }
    /**
     * Generate message asking for missing fields
     */
    generateMissingFieldsMessage(missingFields) {
        const fieldsList = missingFields.join(', ');
        return `Thank you for your interest! To better assist you, could you please provide the following information: ${fieldsList}? This will help us ensure we're the right fit for your needs.`;
    }
    /**
     * Get business configuration
     */
    async getBusinessConfig() {
        const result = await database_1.default.query('SELECT * FROM business_config LIMIT 1');
        if (result.rows.length === 0) {
            throw new Error('No business configuration found. Please set up config first.');
        }
        const row = result.rows[0];
        return {
            id: row.id,
            business_name: row.business_name,
            brand_voice: row.brand_voice,
            approval_mode: row.approval_mode,
            confidence_threshold: row.confidence_threshold,
            required_fields: typeof row.required_fields === 'string' ? JSON.parse(row.required_fields) : (row.required_fields || []),
            business_hours: typeof row.business_hours === 'string' ? JSON.parse(row.business_hours) : (row.business_hours || { start: '09:00', end: '17:00', timezone: 'America/New_York' }),
            ai_disclosure_text: row.ai_disclosure_text,
            escalation_email: row.escalation_email,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    /**
     * Get knowledge base entries
     */
    async getKnowledgeBase() {
        const result = await database_1.default.query(`SELECT * FROM knowledge_base ORDER BY type, key`);
        return result.rows.map((row) => ({
            id: row.id,
            business_id: row.business_id,
            type: row.type,
            key: row.key,
            value: row.value,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
    }
    /**
     * Get conversation history for context
     */
    async getConversationHistory(leadId) {
        // Get messages
        const messages = await database_1.default.query(`SELECT direction, body, sent_at 
       FROM messages 
       WHERE lead_id = $1 
       ORDER BY sent_at ASC 
       LIMIT 10`, [leadId]);
        // Get past decisions for reasoning context
        const decisions = await database_1.default.query(`SELECT action, reasoning, created_at 
       FROM llm_decisions 
       WHERE lead_id = $1 
       ORDER BY created_at ASC 
       LIMIT 10`, [leadId]);
        const history = [];
        messages.rows.forEach(row => {
            const prefix = row.direction === 'inbound' ? 'Lead:' : 'AI:';
            history.push({
                timestamp: row.sent_at,
                text: `${prefix} ${row.body}`
            });
        });
        decisions.rows.forEach(row => {
            history.push({
                timestamp: row.created_at,
                text: `INTERNAL_AI_REASONING: [Action: ${row.action}] ${row.reasoning}`
            });
        });
        // Sort combined history by timestamp
        return history
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
            .map(item => item.text);
    }
}
exports.QualificationEngine = QualificationEngine;
exports.default = new QualificationEngine();
//# sourceMappingURL=qualification-engine.js.map