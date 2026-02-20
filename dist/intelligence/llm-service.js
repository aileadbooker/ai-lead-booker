"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMService = void 0;
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../config");
const database_1 = __importDefault(require("../config/database"));
/**
 * OpenAI LLM Service with mock Y/N flow for testing
 */
class LLMService {
    constructor() {
        this.openai = new openai_1.default({
            apiKey: config_1.config.openaiApiKey,
        });
    }
    /**
     * Main decision method - delegates to mock for now
     */
    async getDecision(lead, conversationHistory, businessConfig, knowledgeBase, isFollowUp = false, followupCount = 0) {
        // use mock if configured OR if api key is missing
        if (config_1.config.useMockLlm || !config_1.config.openaiApiKey) {
            return this.getMockDecision(lead, conversationHistory, isFollowUp, followupCount);
        }
        try {
            // Load custom pitch to guide the AI
            let customPitch = null;
            try {
                const result = await database_1.default.query(`SELECT * FROM custom_pitch WHERE id = 'default'`);
                if (result.rows.length > 0) {
                    customPitch = result.rows[0];
                }
            }
            catch (err) {
                console.warn('Failed to load custom pitch for prompt context');
            }
            const pitchContext = customPitch ? `
Reference Templates (Use these as a style guide for formatting and tone):
Initial Pitch: "${customPitch.initial_pitch}"
Response to YES: "${customPitch.yes_response}"
Response to NO: "${customPitch.no_response}"
` : '';
            const systemPrompt = `You are an expert sales development representative (SDR) for ${config_1.config.businessName}.
Your goal is to book a meeting with the lead.
You are reachable at ${config_1.config.businessName} (email: ${config_1.config.smtp.user}).

Lead Details:
Name: ${lead.name}
Company: ${lead.company}
Source: ${lead.source}

Business Context:
We offer: ${businessConfig.services?.join(', ') || 'AI Automation, Lead Generation, and Custom Software'}
Tone: ${businessConfig.tone || 'Professional yet conversational'}

${pitchContext}

Instructions:
1. Analyze the conversation history (if any) and the lead's details.
2. Decide the next best action: 'book' (if they want a meeting), 'ask_clarification' (if unsure), 'disqualify' (if not interested), or 'reply' (general conversation).
3. Draft a short, personalized email response (under 150 words). 
4. If this is the FIRST email, write a compelling cold outreach hook. Focus on value proposition.
5. Do NOT use placeholders like [Link]. Assume the signature is handled automatically.
6. Important: Output valid JSON only.`;
            const userPrompt = `Conversation History:
${conversationHistory.length > 0 ? conversationHistory.join('\n') : '(No previous history - this is the first contact)'}

Task: Generate the next move and email draft.`;
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.7,
            });
            const response = JSON.parse(completion.choices[0].message.content || '{}');
            return {
                action: response.action || 'ask_clarification',
                confidence: response.confidence || 0.8,
                missing_fields: [],
                message_draft: response.message_draft || response.email_body || '',
                reasoning: response.reasoning || 'AI generated response',
                qualification_scores: response.qualification_scores || { budget: 50, intent: 50, urgency: 50, fit: 50 },
                fallback_used: false
            };
        }
        catch (error) {
            console.error('LLM Error:', error);
            // Fallback to mock if LLM fails
            return this.getMockDecision(lead, conversationHistory, isFollowUp, followupCount);
        }
    }
    /**
     * Mock decision with Y/N sales flow using custom pitches from database
     */
    async getMockDecision(lead, history, isFollowUp = false, followupCount = 0) {
        const lastMessage = history[history.length - 1]?.toLowerCase() || '';
        const messageCount = history.length;
        // Load custom pitch from database
        let customPitch = null;
        try {
            const result = await database_1.default.query(`SELECT * FROM custom_pitch WHERE id = 'default'`);
            if (result.rows.length > 0) {
                customPitch = result.rows[0];
            }
        }
        catch (error) {
            console.error('Failed to load custom pitch:', error);
        }
        // AI-recommended defaults
        const defaults = {
            initial_pitch: `Hey {{name}}! 👋\n\nI noticed you're doing great work at {{company}}. \n\nWe help businesses like yours automate their lead generation using AI agents. We recently helped a similar company book 30+ qualified meetings in their first month.\n\nWould you be open to a 15-min chat to see how this works?\n\nBest,\nKevin Johnson`,
            yes_response: `That's great! You can book a time that works for you here: https://calendly.com/kevin-demo\n\nLooking forward to it!`,
            no_response: `No worries at all. If you ever change your mind or want to see a quick demo video instead, just let me know.\n\nBest of luck with everything!`,
            yes_2_response: `Awesome! Here is the booking link again: https://calendly.com/kevin-demo`,
            no_2_response: `Understood. I won't reach out again. Have a great quarter!`
        };
        // Use custom pitch or defaults
        // Extract first name for more natural greeting (e.g. "Kevin" instead of "Kevin Johnson")
        const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
        const company = lead.company || 'your company';
        const replaceVars = (text) => text
            .replace(/\{\{name\}\}/g, firstName)
            .replace(/\{\{company\}\}/g, company);
        const pitch = {
            initial: replaceVars(customPitch?.initial_pitch || defaults.initial_pitch),
            yes: replaceVars(customPitch?.yes_response || defaults.yes_response),
            no: replaceVars(customPitch?.no_response || defaults.no_response),
            yes2: replaceVars(customPitch?.yes_2_response || defaults.yes_2_response),
            no2: replaceVars(customPitch?.no_2_response || defaults.no_2_response)
        };
        // Detect Y/N
        const saidYes = lastMessage.trim() === 'y' || lastMessage.includes('yes') || lastMessage.includes('interested');
        const saidNo = lastMessage.trim() === 'n' || lastMessage.includes('no') || lastMessage.includes('not interested');
        // Stage 1: Initial outreach
        if (messageCount === 0) {
            return {
                action: 'ask_clarification',
                confidence: 95,
                missing_fields: ['interest'],
                message_draft: pitch.initial,
                reasoning: 'Initial outreach',
                qualification_scores: { budget: 0, intent: 50, urgency: 50, fit: 50 },
                fallback_used: false
            };
        }
        // Stage 2: First YES -> Book
        if (messageCount === 1 && saidYes) {
            return {
                action: 'book',
                confidence: 95,
                missing_fields: [],
                message_draft: pitch.yes,
                reasoning: 'Lead said YES - booking them!',
                qualification_scores: { budget: 80, intent: 90, urgency: 80, fit: 85 },
                fallback_used: false
            };
        }
        // Stage 3: First NO -> Reconvince
        if (messageCount === 1 && saidNo) {
            return {
                action: 'ask_clarification',
                confidence: 70,
                missing_fields: ['reconsider'],
                message_draft: pitch.no,
                reasoning: 'Lead said NO - trying to reconvince',
                qualification_scores: { budget: 0, intent: 30, urgency: 30, fit: 40 },
                fallback_used: false
            };
        }
        // Stage 4: Second YES -> Book
        if (messageCount === 2 && saidYes) {
            return {
                action: 'book',
                confidence: 90,
                missing_fields: [],
                message_draft: pitch.yes2,
                reasoning: 'Lead reconsidered and said YES!',
                qualification_scores: { budget: 75, intent: 85, urgency: 75, fit: 80 },
                fallback_used: false
            };
        }
        // Stage 5: Second NO -> Close politely
        if (messageCount === 2 && saidNo) {
            return {
                action: 'disqualify',
                confidence: 95,
                missing_fields: [],
                message_draft: pitch.no2,
                reasoning: 'Lead declined twice - closing politely',
                qualification_scores: { budget: 0, intent: 10, urgency: 10, fit: 20 },
                fallback_used: false
            };
        }
        // Default: Ask for clarification
        return {
            action: 'ask_clarification',
            confidence: 50,
            missing_fields: [],
            message_draft: `Thanks for your message! Could you clarify if you're interested?`,
            reasoning: 'Unexpected response - asking for clarification',
            qualification_scores: { budget: 0, intent: 30, urgency: 30, fit: 40 },
            fallback_used: false
        };
    }
    /**
     * Generate leads using AI knowledge base
     */
    async generateLeadList(niche, count = 5) {
        if (!config_1.config.openaiApiKey) {
            console.warn('⚠️ No OpenAI API key, falling back to mock leads');
            return []; // Will trigger fallback in generator
        }
        try {
            const systemPrompt = `You are a lead generation expert.
Your goal is to find REAL, existing businesses in the niche: "${niche}".
Return a JSON array of ${count} distinct leads.
For each lead, provide:
- "company": The real company name
- "name": A likely contact person (e.g. Owner, Founder, Manager) based on public info or a generic placeholder if unknown.
- "email": A PLAUSIBLE public email for that business (e.g. contact@domain.com, info@domain.com). Do NOT invent personal emails like "john.doe452@gmail.com". Use the business domain.

Output strictly valid JSON array. No markdown, no explanations.`;
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Find ${count} leads for ${niche}` }
                ],
                response_format: { type: 'json_object' }
            });
            const content = completion.choices[0].message.content || '{"leads": []}';
            const parsed = JSON.parse(content);
            return parsed.leads || parsed.companies || []; // Handle potential schema variations
        }
        catch (error) {
            console.error('AI Lead Gen failed:', error);
            return [];
        }
    }
}
exports.LLMService = LLMService;
exports.default = new LLMService();
//# sourceMappingURL=llm-service.js.map