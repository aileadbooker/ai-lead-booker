"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscalationHandler = void 0;
const database_1 = __importDefault(require("../config/database"));
const uuid_1 = require("uuid");
/**
 * Escalation Handler - Routes leads to humans when necessary
 */
class EscalationHandler {
    /**
     * Create escalation and notify human
     */
    async escalate(lead, reason) {
        console.log(`Escalating lead ${lead.email}: ${reason}`);
        // 1. Create escalation record
        const escalationId = (0, uuid_1.v4)();
        await database_1.default.query(`INSERT INTO escalations (id, lead_id, reason, resolved, created_at)
       VALUES ($1, $2, $3, false, datetime('now'))`, [escalationId, lead.id, reason]);
        // 2. Update lead status
        await database_1.default.query(`UPDATE leads SET status = 'escalated', updated_at = datetime('now') WHERE id = $1`, [lead.id]);
        // 3. Pause automated follow-ups by clearing next_action_at
        await database_1.default.query(`UPDATE leads SET next_action_at = NULL WHERE id = $1`, [lead.id]);
        // 4. Send notification email to escalation email
        await this.sendEscalationNotification(lead, reason);
        // 5. Log action
        await database_1.default.query(`INSERT INTO action_log (id, lead_id, action_type, details)
       VALUES ($1, $2, 'escalation_created', $3)`, [(0, uuid_1.v4)(), lead.id, JSON.stringify({
                reason,
                escalation_id: escalationId,
                timestamp: new Date(),
            })]);
    }
    /**
     * Send escalation notification email
     */
    async sendEscalationNotification(lead, reason) {
        // Get escalation email from config
        const config = await database_1.default.query('SELECT escalation_email FROM business_config LIMIT 1');
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
    shouldEscalate(confidence, action, fallbackUsed) {
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
    async resolveEscalation(escalationId, resolvedBy) {
        await database_1.default.query(`UPDATE escalations 
       SET resolved = true, resolved_at = datetime('now'), resolved_by = $1, updated_at = datetime('now')
       WHERE id = $2`, [resolvedBy, escalationId]);
        console.log(`Escalation ${escalationId} resolved by ${resolvedBy}`);
    }
}
exports.EscalationHandler = EscalationHandler;
exports.default = new EscalationHandler();
//# sourceMappingURL=escalation-handler.js.map