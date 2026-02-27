"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadProcessor = void 0;
const database_1 = __importDefault(require("../config/database"));
const qualification_engine_1 = __importDefault(require("../intelligence/qualification-engine"));
const email_service_1 = __importDefault(require("../ingestion/email-service"));
const escalation_handler_1 = __importDefault(require("../actions/escalation-handler"));
const safety_guardrails_1 = __importDefault(require("../actions/safety-guardrails"));
const config_1 = require("../config");
/**
 * Lead Processor - Main orchestration logic
 * Coordinates: Qualification → Decision → Action
 */
class LeadProcessor {
    /**
     * Process a single lead through the qualification pipeline
     */
    async processLead(lead, isFollowUp = false) {
        // ... (logging)
        console.log(`\n========================================`);
        console.log(`Processing lead: ${lead.email} (${lead.status})`);
        console.log(`========================================\n`);
        // 1. Check for opt-out in latest message
        await this.checkOptOut(lead, isFollowUp);
        // 2. Reload lead
        const reloadedLead = await this.getLead(lead.id);
        if (reloadedLead.opted_out) {
            console.log('Lead has opted out - skipping');
            return;
        }
        // 3. Run qualification engine
        const decision = await qualification_engine_1.default.qualifyLead(reloadedLead, isFollowUp);
        console.log(`Decision: ${decision.action} (confidence: ${decision.confidence}%)`);
        // 4. Handle escalation
        if (escalation_handler_1.default.shouldEscalate(decision.confidence, decision.action, decision.fallback_used || false)) {
            await escalation_handler_1.default.escalate(reloadedLead, decision.reasoning);
            return;
        }
        // 5. Execute action
        await this.executeAction(reloadedLead, decision);
        console.log(`Lead processing complete for ${lead.email}\n`);
    }
    /**
     * Execute action based on LLM decision
     */
    async executeAction(lead, decision) {
        // Safety lock
        if (decision.action !== 'escalate' && decision.action !== 'disqualify') {
            const safetyCheck = await safety_guardrails_1.default.checkSafetyRules(lead, decision.action);
            if (!safetyCheck.allowed) {
                await escalation_handler_1.default.escalate(lead, `Safety Violation: ${safetyCheck.reason}`);
                return;
            }
        }
        switch (decision.action) {
            case 'send_booking_link':
                // For MVP, we presume this is the "I'm interested, let's book" phase
                const winThread = await email_service_1.default.getThreadInfo(lead.id);
                // In a real app, strict calendar service integration would happen here
                await this.sendResponse(lead, decision, winThread || undefined);
                // Update status
                await database_1.default.query(`UPDATE leads SET status = 'ready_to_book' WHERE id = $1`, [lead.id]);
                break;
            case 'ask_clarification':
            case 'nurture':
                const threadInfo = await email_service_1.default.getThreadInfo(lead.id);
                await this.sendResponse(lead, decision, threadInfo || undefined);
                break;
            case 'disqualify':
                await this.sendResponse(lead, decision);
                await database_1.default.query(`UPDATE leads 
                     SET status = 'closed', next_action_at = NULL, updated_at = datetime('now')
                     WHERE id = $1`, [lead.id]);
                console.log(`Lead ${lead.email} disqualified`);
                break;
            case 'escalate':
                await escalation_handler_1.default.escalate(lead, decision.reasoning);
                break;
            default:
                console.warn(`Unknown action: ${decision.action}`);
        }
    }
    /**
     * Safely send a response via EmailService
     */
    async sendResponse(lead, decision, threadInfo) {
        console.log(`Sending response to ${lead.email} (Type: ${decision.action})...`);
        let attachments = undefined;
        // Special handling for booking: Attach ICS invite
        if (decision.action === 'send_booking_link') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);
            const icsContent = email_service_1.default.generateCalendarInvite({
                start: tomorrow,
                durationMinutes: 30,
                title: `Meeting with ${config_1.config.businessName}`,
                description: `Discussion regarding your inquiry.\n\nContext: ${decision.reasoning}`,
                location: 'Google Meet / Zoom'
            }, { name: lead.name || 'Lead', email: lead.email });
            if (icsContent) {
                attachments = [{
                        filename: 'invite.ics',
                        content: icsContent,
                        contentType: 'text/calendar' // Standard MIME type for ICS
                    }];
                console.log('Attached ICS invite to email.');
            }
        }
        const subject = threadInfo ? `Re: ${threadInfo.subject}` : `Re: Inquiry about ${config_1.config.businessName}`;
        const result = await email_service_1.default.sendEmail(lead.user_id, lead, subject, decision.message_draft, threadInfo, attachments);
        if (result.sent) {
            console.log(`✅ Response sent to ${lead.email}`);
            // Log action
            await database_1.default.query(`INSERT INTO action_log (id, lead_id, action_type, details, created_at)
                 VALUES ($1, $2, $3, $4, datetime('now'))`, [
                require('uuid').v4(), // Need to make sure uuid is imported or use subquery if possible, but keeping simple
                lead.id,
                `email_sent_${decision.action}`,
                JSON.stringify({ messageId: result.messageId, subject })
            ]);
            // Update follow-up count logic if needed
            // If it was a nurture/clarification, increment count? 
            // Actually lead-processor's checkOptOut logic handles resetting on inbound.
            // Scheduler handles incrementing.
            // If we reply, we generally reset next_action_at to wait for their reply?
            // For now, let's just mark it as updated.
            await database_1.default.query(`UPDATE leads SET updated_at = datetime('now') WHERE id = $1`, [lead.id]);
        }
        else {
            console.error(`❌ Failed to send response: ${result.reason}`);
            await escalation_handler_1.default.escalate(lead, `Failed to send email: ${result.reason}`);
        }
    }
    /**
     * Check for opt-out in latest message
     */
    async checkOptOut(lead, isFollowUp) {
        const latestMessage = await database_1.default.query(`SELECT body FROM messages 
             WHERE lead_id = $1 AND direction = 'inbound'
             ORDER BY sent_at DESC 
             LIMIT 1`, [lead.id]);
        if (latestMessage.rows.length > 0) {
            const body = latestMessage.rows[0].body;
            if (safety_guardrails_1.default.detectOptOut(body)) {
                await safety_guardrails_1.default.processOptOut(lead.id);
                console.log(`Opt-out detected for ${lead.email} - marked as opted out (silent)`);
            }
            else if (!isFollowUp) {
                // NEW inbound message (not a scheduler scan detected)? 
                // Reset follow-up sequence
                await database_1.default.query(`UPDATE leads SET followup_count = 0 WHERE id = $1`, [lead.id]);
            }
        }
    }
    /**
     * Get lead by ID
     */
    async getLead(leadId) {
        const result = await database_1.default.query('SELECT * FROM leads WHERE id = $1', [leadId]);
        if (result.rows.length === 0)
            throw new Error(`Lead not found: ${leadId}`);
        return this.rowToLead(result.rows[0]);
    }
    rowToLead(row) {
        return {
            id: row.id,
            user_id: row.user_id,
            email: row.email,
            name: row.name,
            phone: row.phone,
            company: row.company,
            source: row.source,
            status: row.status,
            opted_out: row.opted_out === 1 || row.opted_out === true,
            followup_count: row.followup_count || 0,
            last_contact_at: row.last_contact_at,
            next_action_at: row.next_action_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
}
exports.LeadProcessor = LeadProcessor;
exports.default = new LeadProcessor();
//# sourceMappingURL=lead-processor.js.map