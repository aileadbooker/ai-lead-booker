import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Lead } from '../types';

/**
 * Robust Lead Generator Orchestrator
 * Maps search niches to real Google pagination states and aggressively fetches until quotas are hit.
 */
export class LeadGenerator {

    // In-memory state tracking to ensure we never scrape the same Google page twice for a niche
    private nichePages: Map<string, number> = new Map();

    /**
     * Generate leads based on a niche
     * @param niche Target industry/niche (e.g. "Gym Owners")
     * @param count Number of valid, non-duplicate leads to generate
     */
    async generateLeads(niche: string, count: number = 5): Promise<Lead[]> {
        console.log(`🔍 REF: Real-time scraping for ${count} leads in niche: ${niche}...`);

        const newLeads: Lead[] = [];
        let currentPage = this.nichePages.get(niche) || 1;

        let scrapeAttempts = 0;
        const MAX_ATTEMPTS = 5; // Guardrail: stop if the internet is completely drained of this niche

        while (newLeads.length < count && scrapeAttempts < MAX_ATTEMPTS) {
            scrapeAttempts++;
            let scrapedData: any[] = [];

            try {
                const scraper = (await import('./scraper')).default;
                console.log(`🕷️  Scraper ACTIVATED for: ${niche} (Google Page ${currentPage})`);

                // We ask the scraper to look at more domains to guarantee we find enough emails
                const fetchAmount = Math.max(20, count * 2);
                scrapedData = await scraper.findLeads(niche, fetchAmount, currentPage);
            } catch (err) {
                console.error('❌ Critical: Scraping failed:', err);
                break;
            }

            if (scrapedData.length === 0) {
                console.log(`⚠️ Scraper returned 0 leads on page ${currentPage}. Exploring deeper pages...`);
                currentPage++;
                this.nichePages.set(niche, currentPage);
                continue;
            }

            console.log(`✅ Scraper successfully pulled ${scrapedData.length} valid emails on page ${currentPage}. Filtering against DB...`);

            // Loop and save to database
            for (const data of scrapedData) {
                if (newLeads.length >= count) break;

                const email = data.email;
                if (!email) continue;

                // 1. Check for Duplicate Emails
                const existingEmail = await db.query('SELECT id FROM leads WHERE email = $1', [email]);
                if (existingEmail.rows.length > 0) {
                    console.log(`   - Skipping duplicate email: ${email}`);
                    continue;
                }

                // 2. Insert as a fresh Lead
                const leadId = uuidv4();

                await db.query(
                    `INSERT INTO leads (id, email, name, company, source, status, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, 'web_scrape', 'new', datetime('now'), datetime('now'))`,
                    [leadId, email, data.company, data.company]
                );

                newLeads.push({
                    id: leadId,
                    user_id: '',
                    email,
                    name: data.company,
                    company: data.company,
                    source: 'web_scrape',
                    status: 'new',
                    created_at: new Date(),
                    updated_at: new Date(),
                    opted_out: false,
                    followup_count: 0
                });
            }

            // Always increment search page state so the AI acts like a human clicking "Next Page"
            currentPage++;
            this.nichePages.set(niche, currentPage);
        }

        console.log(`✨ Successfully generated and queued ${newLeads.length} highly-targeted NEW leads.`);
        return newLeads;
    }
}

export default new LeadGenerator();
