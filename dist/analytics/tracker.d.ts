/**
 * Analytics Event Types
 */
export type AnalyticsEventType = 'email_sent' | 'reply_received' | 'interested' | 'not_interested' | 'booked' | 'disqualified';
/**
 * Analytics Tracker
 * Records events for analytics dashboard
 */
export declare class AnalyticsTracker {
    /**
     * Track an analytics event
     */
    track(eventType: AnalyticsEventType, leadId?: string, metadata?: Record<string, any>): Promise<void>;
    /**
     * Get analytics summary for a date range
     */
    getSummary(startDate?: string, endDate?: string): Promise<{
        email_sent: number;
        reply_received: number;
        interested: number;
        not_interested: number;
        booked: number;
        disqualified: number;
        response_rate: number;
        booking_rate: number;
    }>;
    /**
     * Get conversion funnel data
     */
    getConversionFunnel(startDate?: string, endDate?: string): Promise<{
        sent: number;
        replied: number;
        interested: number;
        booked: number;
    }>;
    /**
     * Get activity timeline (events per day)
     */
    getActivityTimeline(days?: number): Promise<Record<string, Record<string, number>>>;
    /**
     * Get top performing leads
     */
    getTopLeads(limit?: number): Promise<any[]>;
    private calculateRate;
    private getDateDaysAgo;
}
export declare const analyticsTracker: AnalyticsTracker;
//# sourceMappingURL=tracker.d.ts.map