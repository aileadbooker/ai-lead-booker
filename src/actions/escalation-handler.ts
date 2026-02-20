import { Lead } from '../types';
import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Escalation Handler - Routes leads to humans when necessary
 */
export class EscalationHandler {

    /**
     * Create escalation and notify human
     */
    async escalate(lead: Lead, reason: string): Promise<void> {
        console.log(`Escalating lead ${lead.email}: ${reason}`);

        // 1. Create escalation record
        const escalationId = uuidv4();
        await db.query(
            `INSERT INTO escalations (id, lead_id, reason, resolved, created_at)
       VALUES ($1, $2, $3, false, datetime('now'))`,
            [escalationId, lead.id, reason]
        );

        // 2. Update lead status
        await db.query(
            `UPDATE leads SET status = 'escalated', updated_at = datetime('now') WHERE id = $1`,
            [lead.id]
        );

        // 3. Pause automated follow-ups by clearing next_action_at
        await db.query(
            `UPDATE leads SET next_action_at = NULL WHERE id = $1`,
            [lead.id]
        );

        // 4. Send notification email to escalation email
        await this.sendEscalationNotification(lead, reason);

        // 5. Log action
        await db.query(
            `INSERT INTO action_log (id, lead_id, action_type, details)
       VALUES ($1, $2, 'escalation_created', $3)`,
            [uuidv4(), lead.id, JSON.stringify({
                reason,
                escalation_id: escalationId,
                timestamp: new Date(),
            })]
        );
    }

    /**
     * Send escalation notification email
     */
    private async sendEscalationNotification(lead: Lead, reason: string): Promise<void> {
        // Get escalation email from config
        const config = await db.query('SELECT escalation_email FROM business_config LIMIT 1');
        const escalationEmail = config.rows[0]?.escalation_email;

        if (!escalationEmail) {
            console.warn('No escalation email configured - skipping notification');
            return;
        }

        // TODO: Implement actual email sending to escalation_email
        // For now, just log
        console.log(`Would send escalation notification to ${escalationEmail}`);
        console.log(`Lead: ${lead.name} (${lead.email})`);
        console.log(`Reason: ${reason}`);
    }

    /**
     * Check if lead should be escalated based on criteria
     */
    shouldEscalate(confidence: number, action: string, fallbackUsed: boolean): boolean {
        // Auto-escalate if LLM fallback was used
        if (fallbackUsed) {
            return true;
        }

        // Auto-escalate if action is explicitly 'escalate'
        if (action === 'escalate') {
            return true;
        }

        // Could add more sophisticated rules here
        return false;
    }

    /**
     * Resolve escalation
     */
    async resolveEscalation(escalationId: string, resolvedBy: string): Promise<void> {
        await db.query(
            `UPDATE escalations 
       SET resolved = true, resolved_at = datetime('now'), resolved_by = $1, updated_at = datetime('now')
       WHERE id = $2`,
            [resolvedBy, escalationId]
        );

        console.log(`Escalation ${escalationId} resolved by ${resolvedBy}`);
    }
}

export default new EscalationHandler();
