"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsTracker = exports.AnalyticsTracker = void 0;
const database_1 = __importDefault(require("../config/database"));
const uuid_1 = require("uuid");
/**
 * Analytics Tracker
 * Records events for analytics dashboard
 */
class AnalyticsTracker {
    /**
     * Track an analytics event
     */
    async track(eventType, leadId, metadata) {
        try {
            const id = (0, uuid_1.v4)();
            const metadataJson = metadata ? JSON.stringify(metadata) : null;
            await database_1.default.query(`INSERT INTO analytics_events (id, event_type, lead_id, metadata, created_at)
                 VALUES ($1, $2, $3, $4, datetime('now'))`, [id, eventType, leadId || null, metadataJson]);
            console.log(`📊 Tracked event: ${eventType}${leadId ? ` for lead ${leadId}` : ''}`);
        }
        catch (error) {
            console.error('Failed to track analytics event:', error);
            // Don't throw - analytics should never break the main flow
        }
    }
    /**
     * Get analytics summary for a date range
     */
    async getSummary(startDate, endDate) {
        const start = startDate || this.getDateDaysAgo(30);
        const end = endDate || new Date().toISOString();
        const events = await database_1.default.query(`SELECT event_type, COUNT(*) as count
             FROM analytics_events
             WHERE created_at >= $1 AND created_at <= $2
             GROUP BY event_type`, [start, end]);
        const summary = {};
        for (const row of events.rows) {
            summary[row.event_type] = row.count;
        }
        return {
            email_sent: summary.email_sent || 0,
            reply_received: summary.reply_received || 0,
            interested: summary.interested || 0,
            not_interested: summary.not_interested || 0,
            booked: summary.booked || 0,
            disqualified: summary.disqualified || 0,
            response_rate: this.calculateRate(summary.reply_received || 0, summary.email_sent || 0),
            booking_rate: this.calculateRate(summary.booked || 0, summary.interested || 0),
        };
    }
    /**
     * Get conversion funnel data
     */
    async getConversionFunnel(startDate, endDate) {
        const summary = await this.getSummary(startDate, endDate);
        return {
            sent: summary.email_sent,
            replied: summary.reply_received,
            interested: summary.interested,
            booked: summary.booked,
        };
    }
    /**
     * Get activity timeline (events per day)
     */
    async getActivityTimeline(days = 7) {
        const startDate = this.getDateDaysAgo(days);
        const events = await database_1.default.query(`SELECT 
                DATE(created_at) as date,
                event_type,
                COUNT(*) as count
             FROM analytics_events
             WHERE created_at >= $1
             GROUP BY DATE(created_at), event_type
             ORDER BY date ASC`, [startDate]);
        // Format for charting
        const timeline = {};
        for (const row of events.rows) {
            const date = row.date;
            const eventType = row.event_type;
            const count = row.count;
            if (!timeline[date]) {
                timeline[date] = {};
            }
            timeline[date][eventType] = count;
        }
        return timeline;
    }
    /**
     * Get top performing leads
     */
    async getTopLeads(limit = 10) {
        const leads = await database_1.default.query(`SELECT 
                l.id,
                l.name,
                l.email,
                l.status,
                COUNT(ae.id) as event_count
             FROM leads l
             LEFT JOIN analytics_events ae ON l.id = ae.lead_id
             WHERE l.status != 'disqualified'
             GROUP BY l.id
             ORDER BY event_count DESC
             LIMIT $1`, [limit]);
        return leads.rows;
    }
    // Helper methods
    calculateRate(numerator, denominator) {
        if (denominator === 0)
            return 0;
        return Math.round((numerator / denominator) * 100);
    }
    getDateDaysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString();
    }
}
exports.AnalyticsTracker = AnalyticsTracker;
// Export singleton
exports.analyticsTracker = new AnalyticsTracker();
//# sourceMappingURL=tracker.js.map