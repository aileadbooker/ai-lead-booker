import db from '../config/database';
import leadGenerator from '../ingestion/lead-generator';
import { LLMService } from '../intelligence/llm-service';
import emailService from '../ingestion/email-service';
import { Lead } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Campaign Runner
 * Manages outbound campaigns, throttling, and sending for all users
 */
class CampaignRunner {
    private intervalId: NodeJS.Timeout | null = null;
    private llmService: LLMService;
    private isProcessingQueue: boolean = false;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Initialize master campaign runner
     */
    async init() {
        console.log('🔄 Initializing Master Campaign Runner loop...');
        if (!this.intervalId) {
            // Run processAllQueues every 60 seconds
            this.intervalId = setInterval(() => this.processAllQueues(), 60000);
        }
    }

    /**
     * Start the campaign for a specific user
     */
    async start(userId: string, niche: string, dailyLimit: number) {
        console.log(`🚀 Starting campaign for user ${userId} | niche: ${niche} (Limit: ${dailyLimit}/day)`);

        const id = uuidv4();

        // Save to DB
        await db.query(
            `INSERT INTO campaign_config (id, user_id, status, current_niche, daily_limit, updated_at) 
             VALUES ($1, $2, 'running', $3, $4, datetime('now'))
             ON CONFLICT(user_id) DO UPDATE SET 
             status = 'running', current_niche = excluded.current_niche, daily_limit = excluded.daily_limit, updated_at = datetime('now')`,
            [id, userId, niche, dailyLimit]
        );

        // Run immediately for this user without waiting for the next interval
        this.processUserQueue(userId, niche, dailyLimit).catch(err => {
            console.error(`Immediate queue processing failed for ${userId}:`, err);
        });
    }

    /**
     * Stop/Pause the campaign for a specific user
     */
    async stop(userId: string) {
        console.log(`🛑 Stopping campaign for user ${userId}`);

        // Save to DB
        await db.query(
            `UPDATE campaign_config 
             SET status = 'idle', updated_at = datetime('now')
             WHERE user_id = $1`,
            [userId]
        );
    }

    /**
     * Get current stats for a specific user
     */
    async getStats(userId: string) {
        let status = 'idle';
        let niche = '';
        let dailyLimit = 50;

        const configResult = await db.query(`SELECT status, current_niche, daily_limit FROM campaign_config WHERE user_id = $1`, [userId]);
        if (configResult.rows.length > 0) {
            const config = configResult.rows[0];
            status = config.status as string;
            niche = config.current_niche || '';
            dailyLimit = config.daily_limit || 50;
        }

        // Calculate sentToday dynamically
        const countResult = await db.query(
            `SELECT COUNT(*) as count FROM messages m
             JOIN leads l ON m.lead_id = l.id
             WHERE l.user_id = $1 AND m.direction = 'outbound' 
             AND date(m.sent_at, 'localtime') = date('now', 'localtime')`,
            [userId]
        );
        const sentToday = parseInt(countResult.rows[0].count) || 0;

        return {
            status,
            niche,
            sentToday,
            dailyLimit,
            active: status === 'running'
        };
    }

    /**
     * Main processing loop across all users
     */
    private async processAllQueues() {
        if (this.isProcessingQueue) {
            console.log('⚠️ Master Campaign runner already processing. Skipping cycle.');
            return;
        }

        this.isProcessingQueue = true;

        try {
            const activeCampaigns = await db.query(`SELECT * FROM campaign_config WHERE status = 'running'`);

            for (const config of activeCampaigns.rows) {
                await this.processUserQueue(config.user_id, config.current_niche, config.daily_limit);
            }
        } catch (error) {
            console.error('Error in master campaign processing loop:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Process outreach for a single user
     */
    private async processUserQueue(userId: string, niche: string, dailyLimit: number) {
        try {
            // 1. Check daily limit
            const countResult = await db.query(
                `SELECT COUNT(*) as count FROM messages m
                 JOIN leads l ON m.lead_id = l.id
                 WHERE l.user_id = $1 AND m.direction = 'outbound' 
                 AND date(m.sent_at, 'localtime') = date('now', 'localtime')`,
                [userId]
            );
            let sentToday = parseInt(countResult.rows[0].count) || 0;

            if (sentToday >= dailyLimit) {
                console.log(`⚠️ Daily limit reached for user ${userId} (${sentToday}/${dailyLimit}). Pausing until tomorrow.`);
                return;
            }

            // 2. Find "new" leads that haven't been contacted yet
            let leadsToContact = await db.query(
                `SELECT * FROM leads 
                 WHERE user_id = $1
                 AND (source = 'outbound_campaign' OR source = 'web_scrape')
                 AND status = 'new'
                 LIMIT 5`,
                [userId]
            );

            // 3. If no leads, generate more!
            const remainingForToday = dailyLimit - sentToday;
            if (leadsToContact.rows.length === 0 && remainingForToday > 0) {
                console.log(`📉 No new leads in queue for user ${userId}. Generating fresh leads for niche "${niche}" (${remainingForToday} needed)...`);

                const fetchCount = Math.min(25, remainingForToday);
                const newLeads = await leadGenerator.generateLeads(niche, fetchCount);

                if (newLeads.length === 0) {
                    console.log(`⚠️ Could not generate leads for user ${userId}. Retrying later.`);
                    return;
                }

                // Insert generated leads explicitly linking them to the user
                for (const l of newLeads) {
                    await db.query(
                        `INSERT INTO leads (id, user_id, email, name, company, source, status, created_at, updated_at, opted_out, followup_count)
                         VALUES ($1, $2, $3, $4, $5, 'web_scrape', 'new', datetime('now'), datetime('now'), 0, 0)
                         ON CONFLICT(email) DO NOTHING`,
                        [l.id, userId, l.email, l.name, l.company]
                    );
                }

                // Refetch leads explicitly matching user_id
                leadsToContact = await db.query(
                    `SELECT * FROM leads 
                     WHERE user_id = $1 
                     AND (source = 'outbound_campaign' OR source = 'web_scrape')
                     AND status = 'new'
                     LIMIT 5`,
                    [userId]
                );
            }

            // 4. Process outreach
            for (const row of leadsToContact.rows) {
                if (sentToday >= dailyLimit) break;

                const lead: Lead = {
                    id: row.id,
                    user_id: row.user_id,
                    email: row.email,
                    name: row.name,
                    company: row.company,
                    source: row.source as any,
                    status: row.status as any,
                    created_at: new Date(row.created_at),
                    updated_at: new Date(row.updated_at),
                    followup_count: row.followup_count || 0,
                    opted_out: !!row.opted_out
                };

                const success = await this.sendInitialOutreach(userId, lead);
                if (success) {
                    sentToday++;
                    // Slight delay to be nice to SMTP
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

        } catch (error) {
            console.error(`Error in user queue for ${userId}:`, error);
        }
    }

    /**
     * Send the first email to a lead
     */
    private async sendInitialOutreach(userId: string, lead: Lead): Promise<boolean> {
        try {
            console.log(`📧 User ${userId} sending initial outreach to ${lead.email}...`);

            // 1. Get initial pitch decision from LLM (simulated)
            const decision = await this.llmService.getDecision(
                lead,
                [],
                {
                    business_name: 'AI Agency',
                    services: [],
                    tone: 'professional',
                    confidence_threshold: 0.8
                } as any,
                []
            );

            if (decision.message_draft) {
                // 2. Send Email using the user's specific EmailService logic
                const result = await emailService.sendEmail(
                    userId,
                    lead,
                    'Question for you',
                    this.formatEmailBody(decision.message_draft)
                );

                if (!result.sent) {
                    console.error(`Failed to send email to ${lead.email}: ${result.reason}`);
                    await db.query(
                        `UPDATE leads SET status = 'failed' WHERE id = $1 AND user_id = $2`,
                        [lead.id, userId]
                    );
                    return false;
                }

                // 3. Update Lead Status
                await db.query(
                    `UPDATE leads 
                     SET status = 'contacted', 
                         last_contact_at = datetime('now') 
                     WHERE id = $1 AND user_id = $2`,
                    [lead.id, userId]
                );

                // 4. Log Message
                await db.query(
                    `INSERT INTO messages (id, lead_id, direction, message_id, in_reply_to, subject, body, sent_at)
                     VALUES ($1, $2, 'outbound', $3, NULL, $4, $5, datetime('now'))`,
                    [uuidv4(), lead.id, result.messageId || uuidv4(), 'Question for you', decision.message_draft]
                );

                console.log(`✅ Sent from ${userId} to ${lead.email}`);
                return true;
            }
            return false;

        } catch (error) {
            console.error(`Failed to send outreach to ${lead.email}:`, error);
            return false;
        }
    }

    /**
     * Convert markdown-style text to HTML
     */
    private formatEmailBody(text: string): string {
        if (!text) return '';

        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/\n/g, '<br>');

        return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #333;">${html}</div>`;
    }
}

export default new CampaignRunner();
