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
 * Mock Lead Generator
 * Simulates scraping leads from external sources
 */
class LeadGenerator {
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
    async generateLeads(niche, count = 5) {
        console.log(`🔍 REF: Real-time scraping for ${count} leads in niche: ${niche}...`);
        const newLeads = [];
        let scrapedData = [];
        // 1. EXECUTE REAL WEB SCRAPING
        try {
            const scraper = (await Promise.resolve().then(() => __importStar(require('./scraper')))).default;
            console.log(`🕷️  Scraper ACTIVATED for: ${niche}`);
            scrapedData = await scraper.findLeads(niche, count);
        }
        catch (err) {
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
            if (!email)
                continue;
            // Check duplicates
            const existing = await database_1.default.query('SELECT id FROM leads WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                console.log(`   - Skipping duplicate: ${email}`);
                continue;
            }
            const leadId = (0, uuid_1.v4)();
            await database_1.default.query(`INSERT INTO leads (id, email, name, company, source, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'web_scrape', 'new', datetime('now'), datetime('now'))`, [leadId, email, data.company, data.company] // Use company as name default
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
exports.LeadGenerator = LeadGenerator;
exports.default = new LeadGenerator();
//# sourceMappingURL=lead-generator.js.map