import { Lead, SafetyCheckResult, BusinessConfig } from '../types';
import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Safety Guardrails for AI Lead Booker
 * Pre-flight checks before sending messages or taking actions
 */
export class SafetyGuardrails {

    /**
     * Master safety check before ANY action
     */
    async checkSafetyRules(lead: Lead, action: string): Promise<SafetyCheckResult> {
        // 1. Opt-out check (highest priority)
        if (lead.opted_out) {
            return { allowed: false, reason: 'Lead has opted out' };
        }

        // 2. Rate limiting check
        const rateLimitCheck = await this.checkRateLimit(lead.id);
        if (!rateLimitCheck.allowed) {
            return rateLimitCheck;
        }

        // 3. Business hours enforcement (only for booking)
        const businessHoursCheck = await this.checkBusinessHours(action);
        if (!businessHoursCheck.allowed) {
            return businessHoursCheck;
        }

        // All checks passed
        return { allowed: true };
    }

    /**
     * Check rate limits (daily and weekly)
     */
    private async checkRateLimit(leadId: string): Promise<SafetyCheckResult> {
        const now = new Date();

        // Check daily limit
        const dailyResult = await db.query(
            `SELECT count, reset_at FROM rate_limits 
       WHERE lead_id = $1 AND period = 'daily' AND reset_at > $2`,
            [leadId, now.toISOString()]
        );

        if (dailyResult.rows.length > 0) {
            const dailyCount = dailyResult.rows[0].count;
            if (dailyCount >= 3) {
                return {
                    allowed: false,
                    reason: `Daily message limit exceeded (${dailyCount}/3)`
                };
            }
        }

        // Check weekly limit
        const weeklyResult = await db.query(
            `SELECT count, reset_at FROM rate_limits 
       WHERE lead_id = $1 AND period = 'weekly' AND reset_at > $2`,
            [leadId, now.toISOString()]
        );

        if (weeklyResult.rows.length > 0) {
            const weeklyCount = weeklyResult.rows[0].count;
            if (weeklyCount >= 10) {
                return {
                    allowed: false,
                    reason: `Weekly message limit exceeded (${weeklyCount}/10)`
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Increment rate limit counters
     */
    async incrementRateLimit(leadId: string): Promise<void> {
        const now = new Date();
        const dailyReset = new Date(now);
        dailyReset.setHours(24, 0, 0, 0);

        const weeklyReset = new Date(now);
        weeklyReset.setDate(now.getDate() + (7 - now.getDay()));
        weeklyReset.setHours(24, 0, 0, 0);

        // Upsert daily counter
        await db.query(
            `INSERT INTO rate_limits (id, lead_id, period, count, reset_at)
       VALUES ($1, $2, 'daily', 1, $3)
       ON CONFLICT (lead_id, period) 
       DO UPDATE SET count = rate_limits.count + 1, updated_at = datetime('now')
       WHERE rate_limits.reset_at > datetime('now')`,
            [uuidv4(), leadId, dailyReset.toISOString()]
        );

        // Upsert weekly counter
        await db.query(
            `INSERT INTO rate_limits (id, lead_id, period, count, reset_at)
       VALUES ($1, $2, 'weekly', 1, $3)
       ON CONFLICT (lead_id, period) 
       DO UPDATE SET count = rate_limits.count + 1, updated_at = datetime('now')
       WHERE rate_limits.reset_at > datetime('now')`,
            [uuidv4(), leadId, weeklyReset.toISOString()]
        );
    }

    /**
     * Check if current time is within business hours
     */
    private async checkBusinessHours(action?: string): Promise<SafetyCheckResult> {
        // 24/7 Availability: Only restrict booking links to business hours
        if (action !== 'send_booking_link') {
            return { allowed: true };
        }

        const config = await this.getBusinessConfig();

        if (!config.business_hours) {
            return { allowed: true }; // No restriction if not configured
        }

        const now = new Date();
        const timezone = config.business_hours.timezone || 'America/New_York';

        // Convert to business timezone
        const nowInTZ = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const hour = nowInTZ.getHours();
        const minute = nowInTZ.getMinutes();
        const currentTime = hour * 60 + minute; // minutes since midnight

        const [startHour, startMin] = config.business_hours.start.split(':').map(Number);
        const [endHour, endMin] = config.business_hours.end.split(':').map(Number);

        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        if (currentTime < startTime || currentTime >= endTime) {
            return {
                allowed: false,
                reason: `Booking links only sent during business hours (${config.business_hours.start}-${config.business_hours.end} ${timezone})`
            };
        }

        return { allowed: true };
    }

    /**
     * Detect opt-out requests in message content
     */
    detectOptOut(messageBody: string): boolean {
        const optOutKeywords = [
            'unsubscribe',
            'opt out',
            'opt-out',
            'stop emailing',
            'remove me',
            'take me off',
            'no longer interested',
        ];

        const lowerBody = messageBody.toLowerCase();
        return optOutKeywords.some((keyword) => lowerBody.includes(keyword));
    }

    /**
     * Process opt-out request
     */
    async processOptOut(leadId: string): Promise<void> {
        console.log(`Processing opt-out for lead ${leadId}`);

        await db.query(
            `UPDATE leads SET opted_out = 1, updated_at = datetime('now') WHERE id = $1`,
            [leadId]
        );

        // Log action
        await db.query(
            `INSERT INTO action_log (id, lead_id, action_type, details) 
       VALUES ($1, $2, 'opt_out', $3)`,
            [uuidv4(), leadId, JSON.stringify({ timestamp: new Date(), reason: 'User requested opt-out' })]
        );
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
            required_fields: typeof row.required_fields === 'string' ? JSON.parse(row.required_fields) : (row.required_fields || []),
            business_hours: typeof row.business_hours === 'string' ? JSON.parse(row.business_hours) : row.business_hours,
            ai_disclosure_text: row.ai_disclosure_text,
            escalation_email: row.escalation_email,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
}

export default new SafetyGuardrails();
