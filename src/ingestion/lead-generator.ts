import { v4 as uuidv4 } from 'uuid';
import db from '../config/database';
import { Lead } from '../types';

/**
 * Mock Lead Generator
 * Simulates scraping leads from external sources
 */
export class LeadGenerator {

    /**
     * Generate leads based on a niche
     * @param niche Target industry/niche (e.g. "Gym Owners")
     * @param count Number of leads to generate
     */
    /**
     * Generate leads based on a niche
     * @param niche Target industry/niche (e.g. "Gym Owners")
     * @param count Number of leads to generate
     */
    async generateLeads(niche: string, count: number = 5): Promise<Lead[]> {
        console.log(`🔍 REF: Real-time scraping for ${count} leads in niche: ${niche}...`);

        const newLeads: Lead[] = [];
        let scrapedData: any[] = [];

        // 1. EXECUTE REAL WEB SCRAPING
        try {
            const scraper = (await import('./scraper')).default;
            console.log(`🕷️  Scraper ACTIVATED for: ${niche}`);
            scrapedData = await scraper.findLeads(niche, count);
        } catch (err) {
            console.error('❌ Critical: Scraping failed:', err);
            return []; // Return empty, NEVER mock
        }

        if (scrapedData.length === 0) {
            console.log('⚠️ Scraper returned 0 leads. Try a broader niche keyword.');
            return [];
        }

        console.log(`✅ Scraper found ${scrapedData.length} potential leads. Saving to DB...`);

        // 2. Save Leads
        for (const data of scrapedData) {
            const email = data.email;
            if (!email) continue;

            // Check duplicates
            const existing = await db.query('SELECT id FROM leads WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                console.log(`   - Skipping duplicate: ${email}`);
                continue;
            }

            const leadId = uuidv4();

            await db.query(
                `INSERT INTO leads (id, email, name, company, source, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'web_scrape', 'new', datetime('now'), datetime('now'))`,
                [leadId, email, data.company, data.company] // Use company as name default
            );

            newLeads.push({
                id: leadId,
                email,
                name: data.company,
                company: data.company,
                source: 'web_scrape', // Explicit source
                status: 'new',
                created_at: new Date(),
                updated_at: new Date(),
                opted_out: false,
                followup_count: 0
            });
        }

        console.log(`✨ Successfully added ${newLeads.length} NEW REAL leads.`);
        return newLeads;
    }
}

export default new LeadGenerator();
