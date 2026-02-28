import { Lead, LLMDecision, EmailThreadInfo } from '../types';
import db from '../config/database';
import qualificationEngine from '../intelligence/qualification-engine';
import emailService from '../ingestion/email-service';
import calendarService from '../actions/calendar-service';
import escalationHandler from '../actions/escalation-handler';
import safetyGuardrails from '../actions/safety-guardrails';
import { config } from '../config';

/**
 * Lead Processor - Main orchestration logic
 * Coordinates: Qualification → Decision → Action
 */
export class LeadProcessor {
    /**
     * Process a single lead through the qualification pipeline
     */
    async processLead(lead: Lead, isFollowUp: boolean = false): Promise<void> {
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
        const decision = await qualificationEngine.qualifyLead(reloadedLead, isFollowUp);
        console.log(`Decision: ${decision.action} (confidence: ${decision.confidence}%)`);

        // 4. Handle escalation
        if (escalationHandler.shouldEscalate(decision.confidence, decision.action, decision.fallback_used || false)) {
            await escalationHandler.escalate(reloadedLead, decision.reasoning);
            return;
        }

        // 5. Execute action
        await this.executeAction(reloadedLead, decision);
        console.log(`Lead processing complete for ${lead.email}\n`);
    }

    /**
     * Execute action based on LLM decision
     */
    private async executeAction(lead: Lead, decision: LLMDecision): Promise<void> {
        // Safety lock
        if (decision.action !== 'escalate' && decision.action !== 'disqualify') {
            const safetyCheck = await safetyGuardrails.checkSafetyRules(lead, decision.action);
            if (!safetyCheck.allowed) {
                await escalationHandler.escalate(lead, `Safety Violation: ${safetyCheck.reason}`);
                return;
            }
        }

        switch (decision.action) {
            case 'send_booking_link':
                // For MVP, we presume this is the "I'm interested, let's book" phase
                const winThread = await emailService.getThreadInfo(lead.id);
                // In a real app, strict calendar service integration would happen here
                await this.sendResponse(lead, decision, winThread || undefined);
                // Update status
                await db.query(`UPDATE leads SET status = 'ready_to_book' WHERE id = $1`, [lead.id]);
                break;

            case 'ask_clarification':
            case 'nurture':
                const threadInfo = await emailService.getThreadInfo(lead.id);
                await this.sendResponse(lead, decision, threadInfo || undefined);
                break;

            case 'disqualify':
                await this.sendResponse(lead, decision);
                await db.query(
                    `UPDATE leads 
                     SET status = 'closed', next_action_at = NULL, updated_at = datetime('now')
                     WHERE id = $1`,
                    [lead.id]
                );
                console.log(`Lead ${lead.email} disqualified`);
                break;

            case 'escalate':
                await escalationHandler.escalate(lead, decision.reasoning);
                break;

            default:
                console.warn(`Unknown action: ${decision.action}`);
        }
    }

    /**
     * Safely send a response via EmailService
     */
    private async sendResponse(lead: Lead, decision: LLMDecision, threadInfo?: EmailThreadInfo): Promise<void> {
        console.log(`Sending response to ${lead.email} (Type: ${decision.action})...`);

        let attachments: any[] | undefined = undefined;

        // Special handling for booking: Attach ICS invite
        if (decision.action === 'send_booking_link') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);

            const icsContent = emailService.generateCalendarInvite({
                start: tomorrow,
                durationMinutes: 30,
                title: `Meeting with ${config.businessName}`,
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

        const subject = threadInfo ? `Re: ${threadInfo.subject}` : `Re: Inquiry about ${config.businessName}`;

        const msgId = require('uuid').v4();

        // Save local message draft
        await db.query(
            `INSERT INTO messages (id, workspace_id, lead_id, direction, message_id, in_reply_to, subject, body, gmail_thread_id, sent_at, attachments)
             VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, datetime('now'), $9)`,
            [
                msgId,
                lead.workspace_id,
                lead.id,
                require('uuid').v4(), // Placeholder until provider ID
                threadInfo ? threadInfo.message_id : null,
                subject,
                decision.message_draft,
                threadInfo ? threadInfo.gmail_thread_id : null,
                attachments ? JSON.stringify(attachments) : null
            ]
        );

        // Enqueue job
        await db.query(
            `INSERT INTO send_jobs (id, workspace_id, email_message_id, status, scheduled_at, attempt_count, created_at, updated_at)
             VALUES ($1, $2, $3, 'queued', datetime('now'), 0, datetime('now'), datetime('now'))`,
            [require('uuid').v4(), lead.workspace_id, msgId]
        );

        console.log(`✅ Reply to ${lead.email} queued via durable worker`);

        // Log action
        await db.query(
            `INSERT INTO action_log (id, workspace_id, lead_id, action_type, details, created_at)
             VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
            [
                require('uuid').v4(),
                lead.workspace_id,
                lead.id,
                `email_queued_${decision.action}`,
                JSON.stringify({ subject })
            ]
        );

        await db.query(`UPDATE leads SET updated_at = datetime('now') WHERE id = $1`, [lead.id]);
    }

    /**
     * Check for opt-out in latest message
     */
    private async checkOptOut(lead: Lead, isFollowUp: boolean): Promise<void> {
        const latestMessage = await db.query(
            `SELECT body FROM messages 
             WHERE lead_id = $1 AND direction = 'inbound'
             ORDER BY sent_at DESC 
             LIMIT 1`,
            [lead.id]
        );

        if (latestMessage.rows.length > 0) {
            const body = latestMessage.rows[0].body;

            if (safetyGuardrails.detectOptOut(body)) {
                await safetyGuardrails.processOptOut(lead.id);
                console.log(`Opt-out detected for ${lead.email} - marked as opted out (silent)`);
            } else if (!isFollowUp) {
                // NEW inbound message (not a scheduler scan detected)? 
                // Reset follow-up sequence
                await db.query(
                    `UPDATE leads SET followup_count = 0 WHERE id = $1`,
                    [lead.id]
                );
            }
        }
    }

    /**
     * Get lead by ID
     */
    private async getLead(leadId: string): Promise<Lead> {
        const result = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
        if (result.rows.length === 0) throw new Error(`Lead not found: ${leadId}`);
        return this.rowToLead(result.rows[0]);
    }

    private rowToLead(row: any): Lead {
        return {
            id: row.id,
            workspace_id: row.workspace_id,
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

export default new LeadProcessor();
