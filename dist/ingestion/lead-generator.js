"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadGenerator = void 0;
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../config/database"));
/**
 * Robust Lead Generator Orchestrator
 * Maps search niches to real Google pagination states and aggressively fetches until quotas are hit.
 */
class LeadGenerator {
    constructor() {
        // In-memory state tracking to ensure we never scrape the same Google page twice for a niche
        this.nichePages = new Map();
    }
    /**
     * Generate leads based on a niche
     * @param niche Target industry/niche (e.g. "Gym Owners")
     * @param count Number of valid, non-duplicate leads to generate
     */
    async generateLeads(niche, count = 5) {
        console.log(`🔍 REF: Real-time scraping for ${count} leads in niche: ${niche}...`);
        const newLeads = [];
        let currentPage = this.nichePages.get(niche) || 1;
        let scrapeAttempts = 0;
        const MAX_ATTEMPTS = 5; // Guardrail: stop if the internet is completely drained of this niche
        while (newLeads.length < count && scrapeAttempts < MAX_ATTEMPTS) {
            scrapeAttempts++;
            let scrapedData = [];
            try {
                const scraper = (await Promise.resolve().then(() => __importStar(require('./scraper')))).default;
                console.log(`🕷️  Scraper ACTIVATED for: ${niche} (Google Page ${currentPage})`);
                // We ask the scraper to look at more domains to guarantee we find enough emails
                const fetchAmount = Math.max(20, count * 2);
                scrapedData = await scraper.findLeads(niche, fetchAmount, currentPage);
            }
            catch (err) {
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
                if (newLeads.length >= count)
                    break;
                const email = data.email;
                if (!email)
                    continue;
                // 1. Check for Duplicate Emails
                const existingEmail = await database_1.default.query('SELECT id FROM leads WHERE email = $1', [email]);
                if (existingEmail.rows.length > 0) {
                    console.log(`   - Skipping duplicate email: ${email}`);
                    continue;
                }
                // 2. Insert as a fresh Lead
                const leadId = (0, uuid_1.v4)();
                await database_1.default.query(`INSERT INTO leads (id, email, name, company, source, status, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, 'web_scrape', 'new', datetime('now'), datetime('now'))`, [leadId, email, data.company, data.company]);
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
exports.LeadGenerator = LeadGenerator;
exports.default = new LeadGenerator();
//# sourceMappingURL=lead-generator.js.map