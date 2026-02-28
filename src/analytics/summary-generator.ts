import { AnalyticsTracker } from './tracker';
import emailService from '../ingestion/email-service';
import db from '../config/database';

export class SummaryGenerator {
    private tracker: AnalyticsTracker;

    constructor() {
        this.tracker = new AnalyticsTracker();
    }

    /**
     * Generate and send daily summary
     */
    async generateAndSend(): Promise<void> {
        console.log('Generating daily summary...');

        // 1. Get stats for last 24 hours
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

        const stats = await this.tracker.getSummary(
            startDate.toISOString(),
            endDate.toISOString()
        );

        // 2. Get recent bookings (last 24h)
        const bookings = await db.query(
            `SELECT l.email, l.name, l.company, m.body 
             FROM leads l
             JOIN messages m ON l.id = m.lead_id
             WHERE l.status = 'booked' 
             AND l.updated_at >= $1
             AND m.direction = 'inbound'
             ORDER BY l.updated_at DESC`,
            [startDate.toISOString()]
        );

        // 3. Generate HTML
        const html = this.buildHtml(stats, bookings.rows, startDate);

        // 4. Send Email
        const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        console.log(`[Admin] Daily Summary generated for ${dateStr}. Unified admin email reports are disabled in multi-tenant mode.`);
        // await emailService.sendAdminReport(`Daily Summary - ${dateStr}`, html);
    }

    private buildHtml(stats: any, bookings: any[], date: Date): string {
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        // Calculate conversion color
        const rate = parseFloat(stats.response_rate);
        const rateColor = rate > 20 ? '#10b981' : rate > 10 ? '#f59e0b' : '#ef4444';

        return `
<!DOCTYPE html>
<html>
<head>
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0f172a; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center; }
    .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
    .stat-card { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #0f172a; }
    .stat-label { font-size: 14px; color: #64748b; }
    .section { margin: 30px 0; }
    .booking-item { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin-bottom: 10px; border-radius: 4px; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 40px; }
</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin:0;">📊 Daily Report</h1>
            <p style="margin:5px 0 0; opacity:0.8;">${dateStr}</p>
        </div>

        <div class="card-grid">
            <div class="stat-card">
                <div class="stat-value">${stats.email_sent}</div>
                <div class="stat-label">Emails Sent</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.reply_received}</div>
                <div class="stat-label">Replies</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: ${rateColor}">${stats.response_rate}%</div>
                <div class="stat-label">Response Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.booked}</div>
                <div class="stat-label">New Bookings</div>
            </div>
        </div>

        ${bookings.length > 0 ? `
        <div class="section">
            <h3>🎉 New Bookings (${bookings.length})</h3>
            ${bookings.map((b: any) => `
                <div class="booking-item">
                    <strong>${b.email}</strong> ${b.company ? `(${b.company})` : ''}<br>
                    <span style="font-size:14px; color:#15803d;">"${b.content.substring(0, 100)}..."</span>
                </div>
            `).join('')}
        </div>
        ` : '<div class="section"><p style="color:#64748b; text-align:center;">No new bookings today.</p></div>'}

        <div class="footer">
            Sent by AI Lead Booker • <a href="http://localhost:3000">View Dashboard</a>
        </div>
    </div>
</body>
</html>
        `;
    }
}
