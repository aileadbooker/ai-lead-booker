import db from '../config/database';
import { analyticsTracker } from '../analytics/tracker';

/**
 * Nightly Reconciliation Job
 * Data sanity watchdog that runs nightly to repair orphaned states
 * and ensure the durable queue is completely healthy.
 */
export class ReconciliationJob {
    private intervalId: NodeJS.Timeout | null = null;

    start() {
        // Run once every 12 hours (43200000 ms)
        console.log('🛡️  Nightly Reconciliation Watchdog initialized.');
        this.intervalId = setInterval(() => this.reconcile(), 43200000);

        // Also run once 5 minutes after server start to clean up any immediate orphans
        setTimeout(() => this.reconcile(), 300000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async reconcile() {
        console.log('--- 🔄 Running System Reconciliation Match ---');

        try {
            // 1. Recover Orphaned Jobs
            // If a job has been "sending" for more than 30 minutes, the server probably crashed mid-flight.
            // We revert it to 'queued' so the worker tries again.
            const recovered = await db.query(
                `UPDATE send_jobs 
                 SET status = 'queued', scheduled_at = datetime('now', '+5 minutes'), updated_at = datetime('now')
                 WHERE status = 'sending' AND last_attempt_at < datetime('now', '-30 minutes')
                 RETURNING id`
            );

            if (recovered.rows.length > 0) {
                console.warn(`⚠️ Recovered ${recovered.rows.length} orphaned jobs that were stuck in 'sending' state.`);
            }

            // 2. Kill Doomed Jobs
            // If a job has systematically failed 5 times, mark it skipped permanently so the queue doesn't choke.
            const doomed = await db.query(
                `UPDATE send_jobs 
                 SET status = 'skipped', error_details = 'Permanently failed after 5 attempts', updated_at = datetime('now')
                 WHERE status = 'queued' AND attempt_count >= 5
                 RETURNING id`
            );

            if (doomed.rows.length > 0) {
                console.error(`🛑 Permanently skipped ${doomed.rows.length} jobs that failed >= 5 times.`);
            }

            // 3. Mark old leads as 'cold' if no action in 30 days
            const staleLeads = await db.query(
                `UPDATE leads
                 SET status = 'closed', updated_at = datetime('now')
                 WHERE status IN ('new', 'qualifying') AND created_at < datetime('now', '-30 days')
                 RETURNING id`
            );

            if (staleLeads.rows.length > 0) {
                console.log(`❄️ Marked ${staleLeads.rows.length} stale leads as closed.`);
            }

            // 4. Force idle campaigns that are still 'running' for deleted workspaces to 'idle'
            const rogueCampaigns = await db.query(
                `UPDATE campaign_config
                 SET status = 'idle', updated_at = datetime('now')
                 WHERE status = 'running' AND workspace_id NOT IN (SELECT id FROM workspaces)
                 RETURNING id`
            );

            if (rogueCampaigns.rows.length > 0) {
                console.log(`🛑 Deactivated ${rogueCampaigns.rows.length} rogue campaigns for invalid workspaces.`);
            }

            console.log('--- ✅ Reconciliation Match Complete ---');
        } catch (error) {
            console.error('Error during Nightly Reconciliation:', error);
        }
    }
}

export default new ReconciliationJob();
