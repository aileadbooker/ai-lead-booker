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
exports.WebScraper = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
/**
 * Robust Web Scraper 🕵️‍♂️
 * Rotates User-Agents and tries multiple search engines.
 */
class WebScraper {
    constructor() {
        this.USER_AGENTS = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
        ];
    }
    /**
     * Search for leads
     */
    async findLeads(niche, maxResults = 5) {
        console.log(`🔎 Scraping for: "${niche}"...`);
        let results = [];
        // 1. Try Yahoo (Often easier to scrape)
        try {
            console.log('Trying Yahoo Search...');
            results = await this.searchYahoo(niche, maxResults * 2);
        }
        catch (e) {
            console.error('Yahoo failed', e);
        }
        // 2. Fallback to Google if Yahoo fails
        if (results.length === 0) {
            console.log('⚠️ Yahoo returned 0 results. Trying Google...');
            try {
                results = await this.searchGoogle(niche, maxResults * 2);
            }
            catch (e) {
                console.error('Google failed', e);
            }
        }
        // 3. Fallback to Bing
        if (results.length === 0) {
            console.log('⚠️ Google returned 0 results. Trying Bing...');
            try {
                results = await this.searchBing(niche, maxResults * 2);
            }
            catch (e) {
                console.error('Bing failed', e);
            }
        }
        const leads = [];
        console.log(`Found ${results.length} potential websites. Scanning for emails...`);
        for (const result of results) {
            if (leads.length >= maxResults)
                break;
            const url = result.url;
            if (this.isBlacklisted(url))
                continue;
            try {
                const email = await this.extractEmailFromSite(url);
                if (email) {
                    leads.push({
                        company: result.title,
                        url: url,
                        email: email,
                        source: 'web_scrape'
                    });
                    console.log(`✅ Found lead: ${email} (${url})`);
                }
            }
            catch (error) {
                // Ignore
            }
        }
        return leads;
    }
    isBlacklisted(url) {
        const blacklist = ['yelp.com', 'facebook.com', 'linkedin.com', 'yellowpages.com', 'instagram.com', 'twitter.com', 'youtube.com', 'google.com', 'yahoo.com', 'bing.com'];
        return blacklist.some(domain => url.includes(domain));
    }
    /**
     * Scrape Yahoo
     */
    async searchYahoo(query, limit) {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const response = await axios_1.default.get(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit + 5}`, {
                headers: { 'User-Agent': ua }
            });
            const $ = cheerio.load(response.data);
            const results = [];
            // Yahoo selectors (often 'div.algo' or 'h3.title > a')
            $('h3.title a').each((i, element) => {
                const title = $(element).text();
                let url = $(element).attr('href');
                // Decode Yahoo redirect URLs if needed (often direct, sometimes wrapped)
                if (url && url.includes('RU=')) {
                    try {
                        // Extract RU param
                        const match = url.match(/RU=([^/]+)/);
                        if (match && match[1])
                            url = decodeURIComponent(match[1]);
                    }
                    catch (e) { }
                }
                if (title && url && url.startsWith('http')) {
                    results.push({ title, url });
                }
            });
            return results.slice(0, limit);
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Scrape Google
     */
    async searchGoogle(query, limit) {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const response = await axios_1.default.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit + 5}`, {
                headers: {
                    'User-Agent': ua,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                }
            });
            const $ = cheerio.load(response.data);
            const results = [];
            // Targeted selectors for Google
            $('div.g').each((i, element) => {
                const title = $(element).find('h3').first().text();
                const url = $(element).find('a').first().attr('href');
                if (title && url && url.startsWith('http')) {
                    results.push({ title, url });
                }
            });
            return results.slice(0, limit);
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Scrape Bing
     */
    async searchBing(query, limit) {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const response = await axios_1.default.get(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit + 5}`, {
                headers: {
                    'User-Agent': ua,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                }
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('li.b_algo h2 a').each((i, element) => {
                const title = $(element).text();
                const url = $(element).attr('href');
                if (title && url && url.startsWith('http')) {
                    results.push({ title, url });
                }
            });
            return results.slice(0, limit);
        }
        catch (error) {
            return [];
        }
    }
    async extractEmailFromSite(url) {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
            const response = await axios_1.default.get(url, {
                headers: { 'User-Agent': ua },
                signal: controller.signal
            });
            clearTimeout(timeout);
            const html = response.data;
            if (typeof html !== 'string')
                return null;
            // Robust Email Regex (Strict)
            // - Must have at least 2 chars before @
            // - Domain must have at least one dot
            // - TLD must be 2+ chars
            const emailRegex = /([a-zA-Z0-9._-]{2,}@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi;
            const matches = html.match(emailRegex);
            if (matches) {
                const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase()))];
                const validEmails = uniqueEmails.filter(email => {
                    // 1. Filter out common junk/placeholders
                    if (email.includes('sentry') ||
                        email.includes('example') ||
                        email.includes('wixpress') ||
                        email.includes('domain.com') ||
                        email.includes('email.com') ||
                        email.includes('godaddy') ||
                        email.includes('name@') ||
                        email.includes('user@') ||
                        email.includes('admin@') && !email.includes('info'))
                        return false;
                    // 2. Filter out image/code false positives
                    if (email.match(/\.(png|jpg|jpeg|gif|svg|css|js|webp|woff|woff2|ttf|eot)$/))
                        return false;
                    // 3. Length checks
                    if (email.length > 60 || email.length < 6)
                        return false;
                    return true;
                });
                if (validEmails.length > 0) {
                    // Prioritize specific roles
                    const priority = validEmails.find(e => e.startsWith('info') || e.startsWith('contact') || e.startsWith('hello') || e.startsWith('sales'));
                    return priority || validEmails[0];
                }
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
}
exports.WebScraper = WebScraper;
exports.default = new WebScraper();
//# sourceMappingURL=scraper.js.map