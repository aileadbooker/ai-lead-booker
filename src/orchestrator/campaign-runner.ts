import db from '../config/database';
import leadGenerator from '../ingestion/lead-generator';
import { LLMService } from '../intelligence/llm-service';
import emailService from '../ingestion/email-service';
import { Lead } from '../types';

/**
 * Campaign Runner
 * Manages outbound campaigns, throttling, and sending
 */
class CampaignRunner {
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private llmService: LLMService;

    // Campaign State
    private status: 'idle' | 'running' | 'paused' = 'idle';
    private currentNiche: string = '';
    private dailyLimit: number = 50;
    private sentToday: number = 0;
    private lastRunDate: string = '';

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Initialize campaign runner from DB state
     */
    async init() {
        console.log('🔄 Initializing Campaign Runner from database...');
        try {
            // Get or create campaign config
            let configResult = await db.query(`SELECT * FROM campaign_config WHERE id = 'default'`);

            if (configResult.rows.length === 0) {
                await db.query(
                    `INSERT INTO campaign_config (id, status, current_niche, daily_limit) VALUES ('default', 'idle', '', 50)`
                );
            } else {
                const config = configResult.rows[0];
                this.status = config.status as any;
                this.currentNiche = config.current_niche || '';
                this.dailyLimit = config.daily_limit || 50;

                if (this.status === 'running' && this.currentNiche) {
                    console.log(`▶️ Resuming active campaign for "${this.currentNiche}"...`);

                    // Reset daily count if it's a new day
                    const today = new Date().toISOString().split('T')[0];
                    if (this.lastRunDate !== today) {
                        this.sentToday = 0;
                        this.lastRunDate = today;
                    }

                    // Start processing loop
                    this.processQueue();
                    if (!this.intervalId) {
                        this.intervalId = setInterval(() => this.processQueue(), 60000);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to initialize Campaign Runner:', error);
        }
    }

    /**
     * Start the campaign
     */
    async start(niche: string, dailyLimit: number) {
        if (this.status === 'running') return;

        console.log(`🚀 Starting campaign for niche: ${niche} (Limit: ${dailyLimit}/day)`);

        this.status = 'running';
        this.currentNiche = niche;
        this.dailyLimit = dailyLimit;

        // Save to DB
        await db.query(
            `UPDATE campaign_config 
             SET status = 'running', current_niche = $1, daily_limit = $2, updated_at = datetime('now')
             WHERE id = 'default'`,
            [niche, dailyLimit]
        );

        // Reset daily count if it's a new day
        const today = new Date().toISOString().split('T')[0];
        if (this.lastRunDate !== today) {
            this.sentToday = 0;
            this.lastRunDate = today;
        }

        // Initialize from DB if 0 (handling restarts)
        if (this.sentToday === 0) {
            const countResult = await db.query(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE direction = 'outbound' 
                 AND date(sent_at) = date('now')`
            );
            this.sentToday = parseInt(countResult.rows[0].count) || 0;
            console.log(`📊 Restored daily count: ${this.sentToday}/${this.dailyLimit}`);
        }

        // Start processing loop
        this.processQueue(); // Run immediately
        this.intervalId = setInterval(() => this.processQueue(), 60000); // Check every minute
    }

    /**
     * Stop/Pause the campaign
     */
    async stop() {
        console.log('🛑 Stopping campaign');
        this.status = 'idle'; // effectively "stopped" for MVP, 'paused' could keep state

        // Save to DB
        await db.query(
            `UPDATE campaign_config 
             SET status = 'idle', updated_at = datetime('now')
             WHERE id = 'default'`
        );

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Get current stats
     */
    /**
     * Get current stats
     */
    async getStats() {
        // Read config from DB to ensure sync
        const configResult = await db.query(`SELECT status, current_niche, daily_limit FROM campaign_config WHERE id = 'default'`);
        if (configResult.rows.length > 0) {
            const config = configResult.rows[0];
            this.status = config.status as any;
            this.currentNiche = config.current_niche || '';
            this.dailyLimit = config.daily_limit || 50;
        }

        // Always fetch truth from DB to avoid memory drift
        const countResult = await db.query(
            `SELECT COUNT(*) as count FROM messages 
             WHERE direction = 'outbound' 
             AND date(sent_at) = date('now')`
        );
        this.sentToday = parseInt(countResult.rows[0].count) || 0;

        return {
            status: this.status,
            niche: this.currentNiche,
            sentToday: this.sentToday,
            dailyLimit: this.dailyLimit,
            active: this.status === 'running'
        };
    }

    // State
    private isProcessingQueue: boolean = false;

    /**
     * Main processing loop
     */
    private async processQueue() {
        if (this.status !== 'running') return;
        if (this.isProcessingQueue) {
            console.log('⚠️ Campaign runner already processing. Skipping cycle.');
            return;
        }

        this.isProcessingQueue = true;

        try {
            // 1. Check daily limit
            // BUGFIX: Use toLocaleDateString('en-CA') to get local YYYY-MM-DD instead of UTC
            const today = new Date().toLocaleDateString('en-CA', {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });

            if (this.lastRunDate !== today) {
                this.sentToday = 0; // Reset for new day
                this.lastRunDate = today;
            }

            if (this.sentToday >= this.dailyLimit) {
                console.log(`⚠️ Daily limit reached (${this.sentToday}/${this.dailyLimit}). Pausing until tomorrow.`);
                return;
            }

            // 2. Find "new" leads that haven't been contacted yet
            // Updated to fetch ANY 'new' leads if they were generated by our scraper (web_scrape)
            // or explicitly marked for campaign (outbound_campaign)
            let leadsToContact = await db.query(
                `SELECT * FROM leads 
                 WHERE (source = 'outbound_campaign' OR source = 'web_scrape')
                 AND status = 'new'
                 LIMIT 5` // Batches of 5 to avoid overwhelming
            );

            // 3. If no leads, generate more!
            const remainingForToday = this.dailyLimit - this.sentToday;
            if (leadsToContact.rows.length === 0 && remainingForToday > 0) {
                console.log(`📉 No new leads in queue. Generating fresh leads to satisfy remaining daily target (${remainingForToday} needed)...`);

                // Aggressively fetch a chunk of leads to keep the pipeline moving rapidly
                const fetchCount = Math.min(25, remainingForToday);
                const newLeads = await leadGenerator.generateLeads(this.currentNiche, fetchCount);

                if (newLeads.length === 0) {
                    console.log('⚠️ Could not generate leads. Retrying later.');
                    return;
                }

                // Refetch to get the DB rows (consistent format)
                // We must use the IDs we just created
                const idList = newLeads.map(l => `'${l.id}'`).join(',');
                leadsToContact = await db.query(
                    `SELECT * FROM leads WHERE id IN (${idList})`
                );
            }

            // 4. Process outreach
            for (const row of leadsToContact.rows) {
                if (this.sentToday >= this.dailyLimit) break;

                const lead: Lead = {
                    id: row.id,
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

                const success = await this.sendInitialOutreach(lead);
                if (success) {
                    this.sentToday++;
                    // Slight delay to be nice to SMTP
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

        } catch (error) {
            console.error('Error in campaign runner:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Send the first email to a lead
     */
    private async sendInitialOutreach(lead: Lead): Promise<boolean> {
        try {
            console.log(`📧 Sending initial outreach to ${lead.email}...`);

            // 1. Get initial pitch decision from LLM (simulated)
            const decision = await this.llmService.getDecision(
                lead,
                [],
                {
                    business_name: 'AI Agency',
                    // industry: 'Marketing', // Removed invalid property
                    services: [],
                    tone: 'professional',
                    confidence_threshold: 0.8
                } as any,
                []
            );

            if (decision.message_draft) {
                // 2. Send Email
                const result = await emailService.sendEmail(
                    lead,
                    'Question for you',
                    this.formatEmailBody(decision.message_draft)
                );

                if (!result.sent) {
                    console.error(`Failed to send email to ${lead.email}: ${result.reason}`);

                    // NEW: Explicitly mark as failed so the UI doesn't display incorrect state
                    await db.query(
                        `UPDATE leads SET status = 'failed' WHERE id = $1`,
                        [lead.id]
                    );
                    return false;
                }

                // 3. Update Lead Status
                await db.query(
                    `UPDATE leads 
                     SET status = 'contacted', 
                         last_contact_at = datetime('now') 
                     WHERE id = $1`,
                    [lead.id]
                );

                // 4. Log Message
                await db.query(
                    `INSERT INTO messages (id, lead_id, direction, message_id, in_reply_to, subject, body, sent_at)
                     VALUES ($1, $2, 'outbound', $3, $4, datetime('now'))`,
                    [uuidv4(), lead.id, 'Question for you', decision.message_draft]
                );

                console.log(`✅ Sent to ${lead.email}`);
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
            // Bold (**text**)
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            // Italic (*text*)
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            // Newlines to <br>
            .replace(/\n/g, '<br>');

        return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #333;">${html}</div>`;
    }
}

// Helper to generate UUIDs since we didn't import inside class
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export default new CampaignRunner();
