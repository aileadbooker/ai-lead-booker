import { Lead, EmailSendResult, BusinessConfig } from '../types';
import db from '../config/database';
import gmailService from '../ingestion/gmail-service';
import safetyGuardrails from './safety-guardrails';
import { v4 as uuidv4 } from 'uuid';

/**
 * Email Sender with Shadow Mode Support and Threading
 */
export class EmailSender {

    /**
     * Send email with full safety checks and shadow mode support
     */
    async sendMessage(
        lead: Lead,
        messageContent: string,
        subject?: string
    ): Promise<EmailSendResult> {

        // 1. Get business config to check shadow/live mode
        const config = await this.getBusinessConfig();

        // 2. Run safety guardrails
        const safetyCheck = await safetyGuardrails.checkSafetyRules(lead, 'send_email');
        if (!safetyCheck.allowed) {
            console.log('Safety check failed:', safetyCheck.reason);
            return { sent: false, reason: safetyCheck.reason };
        }

        // 3. Append AI disclosure if configured
        let finalMessage = messageContent;
        if (config.ai_disclosure_text) {
            finalMessage += `\n\n---\n${config.ai_disclosure_text}`;
        }

        // 4. Append unsubscribe instructions
        finalMessage += '\n\nTo unsubscribe, reply with "unsubscribe" in the subject or body.';

        // 5. Get threading info for proper email threading
        const threadInfo = await gmailService.getThreadInfo(lead.id);
        const emailSubject = subject || (threadInfo ? `Re: ${threadInfo.subject}` : 'Following up on your inquiry');

        // 6. CRITICAL: Shadow mode check
        if (config.approval_mode === 'shadow') {
            console.log('SHADOW MODE: Email would be sent but logging only');

            // Log shadow action
            await db.query(
                `INSERT INTO action_log (id, lead_id, action_type, details)
         VALUES ($1, $2, 'shadow_email', $3)`,
                [uuidv4(), lead.id, JSON.stringify({
                    to: lead.email,
                    subject: emailSubject,
                    body: finalMessage,
                    would_send: true,
                    blocked_reason: 'shadow_mode',
                    timestamp: new Date(),
                })]
            );

            return { sent: false, reason: 'shadow_mode' };
        }

        // 7. LIVE MODE: Send via Gmail API
        console.log(`LIVE MODE: Sending email to ${lead.email}`);

        const result = await gmailService.sendEmail(
            lead,
            emailSubject,
            finalMessage,
            threadInfo || undefined
        );

        if (!result.sent) {
            return result;
        }

        // 8. Increment rate limit counters
        await safetyGuardrails.incrementRateLimit(lead.id);

        // 9. Update lead last_contact_at
        await db.query(
            `UPDATE leads SET last_contact_at = datetime('now'), updated_at = datetime('now') WHERE id = $1`,
            [lead.id]
        );

        // 10. Log successful send
        await db.query(
            `INSERT INTO action_log (id, lead_id, action_type, details)
       VALUES ($1, $2, 'email_sent', $3)`,
            [uuidv4(), lead.id, JSON.stringify({
                to: lead.email,
                subject: emailSubject,
                message_id: result.messageId,
                timestamp: new Date(),
            })]
        );

        return result;
    }

    /**
     * Get business configuration
     */
    private async getBusinessConfig(): Promise<BusinessConfig> {
        const result = await db.query('SELECT * FROM business_config LIMIT 1');

        if (result.rows.length === 0) {
            throw new Error('No business configuration found');
        }

        const row = result.rows[0];
        return {
            id: row.id,
            business_name: row.business_name,
            brand_voice: row.brand_voice,
            approval_mode: row.approval_mode,
            confidence_threshold: row.confidence_threshold,
            required_fields: row.required_fields || [],
            business_hours: row.business_hours,
            ai_disclosure_text: row.ai_disclosure_text,
            escalation_email: row.escalation_email,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
}

export default new EmailSender();
