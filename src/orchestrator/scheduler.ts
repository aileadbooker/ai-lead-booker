import db from '../config/database';
import leadProcessor from './lead-processor';

/**
 * Follow-up Scheduler
 * Background service that scans for leads requiring automated follow-ups
 */
export class FollowupScheduler {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    /**
     * Start the scheduler
     */
    start(intervalMs: number = 300000): void { // Default 5 minutes
        console.log(`Starting follow-up scheduler (scanning every ${intervalMs / 1000}s)...`);

        // Initial scan
        this.scan();

        this.intervalId = setInterval(() => {
            this.scan();
        }, intervalMs);
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Follow-up scheduler stopped');
        }
    }

    /**
     * Scan database for leads due for follow-up
     */
    private async scan(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            console.log('--- Scanning for pending follow-ups ---');

            // Find leads where next_action_at is in the past and they aren't opted out
            const result = await db.query(
                `SELECT * FROM leads 
                 WHERE next_action_at IS NOT NULL 
                 AND next_action_at <= datetime('now')
                 AND opted_out = 0 
                 AND status != 'closed' 
                 AND status != 'escalated'
                 LIMIT 10`
            );

            if (result.rows.length === 0) {
                console.log('No pending follow-ups');
                this.isRunning = false;
                return;
            }

            console.log(`Found ${result.rows.length} lead(s) due for follow-up`);

            for (const lead of result.rows) {
                try {
                    console.log(`Triggering follow-up for: ${lead.email}`);
                    await leadProcessor.processLead(lead, true);
                } catch (error) {
                    console.error(`Error processing follow-up for ${lead.email}:`, error);
                }
            }

            console.log('--- Follow-up scan complete ---');
        } catch (error) {
            console.error('Error during follow-up scan:', error);
        } finally {
            this.isRunning = false;
        }
    }
}

export default new FollowupScheduler();
