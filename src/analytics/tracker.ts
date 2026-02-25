import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Analytics Event Types
 */
export type AnalyticsEventType =
    | 'email_sent'
    | 'reply_received'
    | 'interested' // Lead said Y
    | 'not_interested' // Lead said N
    | 'booked'
    | 'disqualified';

/**
 * Analytics Tracker
 * Records events for analytics dashboard
 */
export class AnalyticsTracker {
    /**
     * Track an analytics event
     */
    async track(
        eventType: AnalyticsEventType,
        leadId?: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        try {
            const id = uuidv4();
            const metadataJson = metadata ? JSON.stringify(metadata) : null;

            await db.query(
                `INSERT INTO analytics_events (id, event_type, lead_id, metadata, created_at)
                 VALUES ($1, $2, $3, $4, datetime('now'))`,
                [id, eventType, leadId || null, metadataJson]
            );

            console.log(`📊 Tracked event: ${eventType}${leadId ? ` for lead ${leadId}` : ''}`);
        } catch (error) {
            console.error('Failed to track analytics event:', error);
            // Don't throw - analytics should never break the main flow
        }
    }

    /**
     * Get analytics summary for a date range
     */
    async getSummary(startDate?: string, endDate?: string) {
        const start = startDate || this.getDateDaysAgo(30);
        const end = endDate || new Date().toISOString();

        const events = await db.query(
            `SELECT event_type, COUNT(*) as count
             FROM analytics_events
             WHERE created_at >= $1 AND created_at <= $2
             GROUP BY event_type`,
            [start, end]
        );

        const summary: Record<string, number> = {};
        for (const row of events.rows) {
            summary[row.event_type as string] = row.count as number;
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
    async getConversionFunnel(startDate?: string, endDate?: string) {
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
    async getActivityTimeline(days: number = 7) {
        const startDate = this.getDateDaysAgo(days);

        const events = await db.query(
            `SELECT 
                DATE(created_at, 'localtime') as date,
                event_type,
                COUNT(*) as count
             FROM analytics_events
             WHERE created_at >= $1
             GROUP BY DATE(created_at, 'localtime'), event_type
             ORDER BY date ASC`,
            [startDate]
        );

        // Format for charting
        const timeline: Record<string, Record<string, number>> = {};
        for (const row of events.rows) {
            const date = row.date as string;
            const eventType = row.event_type as string;
            const count = row.count as number;

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
    async getTopLeads(limit: number = 10) {
        const leads = await db.query(
            `SELECT 
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
             LIMIT $1`,
            [limit]
        );

        return leads.rows;
    }

    // Helper methods
    private calculateRate(numerator: number, denominator: number): number {
        if (denominator === 0) return 0;
        return Math.round((numerator / denominator) * 100);
    }

    private getDateDaysAgo(days: number): string {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString();
    }
}

// Export singleton
export const analyticsTracker = new AnalyticsTracker();
