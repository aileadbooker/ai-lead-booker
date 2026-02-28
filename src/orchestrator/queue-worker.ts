import db from '../config/database';
import emailService from '../ingestion/email-service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Queue Worker
 * Background reliable processor for outbound messages.
 * Polls `send_jobs` and transacts state updates.
 */
class QueueWorker {
    private intervalId: NodeJS.Timeout | null = null;
    private isWorking: boolean = false;

    start(intervalMs: number = 5000) {
        if (!this.intervalId) {
            console.log(`Starting durable queue worker (polling every ${intervalMs}ms)...`);
            this.intervalId = setInterval(() => this.processQueue(), intervalMs);
        }
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Durable queue worker stopped.');
        }
    }

    async processQueue() {
        if (this.isWorking) return;
        this.isWorking = true;

        try {
            // Find jobs to process
            // Priority: scheduled_at <= now, status = queued OR (status = sending AND last_attempt > 10 mins ago)
            const result = await db.query(
                `SELECT * FROM send_jobs
                 WHERE (status = 'queued' AND scheduled_at <= datetime('now'))
                    OR (status = 'sending' AND last_attempt_at <= datetime('now', '-10 minutes'))
                 ORDER BY scheduled_at ASC
                 LIMIT 5`
            );

            if (result.rows.length === 0) {
                this.isWorking = false;
                return;
            }

            for (const job of result.rows) {
                await this.processJob(job);
            }

        } catch (error) {
            console.error('Queue Worker Error:', error);
        } finally {
            this.isWorking = false;
        }
    }

    private async processJob(job: any) {
        try {
            // Mark as sending
            await db.query(`UPDATE send_jobs SET status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = datetime('now') WHERE id = $1`, [job.id]);

            // Get message details
            const msgResult = await db.query(`SELECT m.*, l.email as lead_email, l.name as lead_name FROM messages m JOIN leads l ON m.lead_id = l.id WHERE m.id = $1`, [job.email_message_id]);
            if (msgResult.rows.length === 0) {
                await db.query(`UPDATE send_jobs SET status = 'failed', error_details = 'Message not found' WHERE id = $1`, [job.id]);
                return;
            }
            const message = msgResult.rows[0];

            // Dummy lead object for emailService
            const lead = {
                id: message.lead_id,
                email: message.lead_email,
                name: message.lead_name
            };

            // Send message via emailService
            const sendResult = await emailService.sendEmail(
                job.workspace_id,
                lead as any,
                message.subject,
                message.body,
                message.in_reply_to
            );

            if (sendResult.sent) {
                await db.query(
                    `UPDATE send_jobs SET status = 'sent', provider_message_id = $1, error_details = NULL, updated_at = datetime('now') WHERE id = $2`,
                    [sendResult.messageId || null, job.id]
                );

                // Update lead last status
                await db.query(
                    `UPDATE leads SET status = 'contacted', last_contact_at = datetime('now') WHERE id = $1`,
                    [lead.id]
                );
            } else {
                throw new Error(sendResult.reason || 'Unknown sending error');
            }

        } catch (error: any) {
            console.error(`Failed to execute job ${job.id}:`, error);
            const errDetail = error.message || String(error);
            const newStatus = job.attempt_count >= 3 ? 'failed' : 'queued';

            // Backoff retry: 5 minutes if queued, else remains failed
            const timeModifier = newStatus === 'queued' ? `'+5 minutes'` : `'0 minutes'`;

            await db.query(
                `UPDATE send_jobs SET status = $1, error_details = $2, scheduled_at = datetime('now', ${timeModifier}), updated_at = datetime('now') WHERE id = $3`,
                [newStatus, errDetail, job.id]
            );
        }
    }
}

export default new QueueWorker();
