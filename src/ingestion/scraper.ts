import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Robust Web Scraper 🕵️‍♂️
 * Rotates User-Agents and tries multiple search engines.
 * Feature Update: Deep-Crawling and Search Pagination for 10x Volume.
 */
export class WebScraper {
    private readonly USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    ];

    /**
     * Search for leads
     */
    async findLeads(niche: string, maxResults: number = 5, page: number = 1): Promise<Array<{ company: string, url: string, email?: string, source: string }>> {
        console.log(`🔎 Scraping for: "${niche}" (Page ${page})...`);

        let results: Array<{ title: string, url: string }> = [];

        // 1. Try Yahoo (Often easier to scrape)
        try {
            console.log(`Trying Yahoo Search (Page ${page})...`);
            results = await this.searchYahoo(niche, maxResults * 2, page);
        } catch (e) { console.error('Yahoo failed', e); }

        // 2. Fallback to Google if Yahoo fails
        if (results.length === 0) {
            console.log(`⚠️ Yahoo returned 0 results. Trying Google (Page ${page})...`);
            try {
                results = await this.searchGoogle(niche, maxResults * 2, page);
            } catch (e) { console.error('Google failed', e); }
        }

        // 3. Fallback to Bing
        if (results.length === 0) {
            console.log(`⚠️ Google returned 0 results. Trying Bing (Page ${page})...`);
            try {
                results = await this.searchBing(niche, maxResults * 2, page);
            } catch (e) { console.error('Bing failed', e); }
        }

        const leads: Array<{ company: string, url: string, email?: string, source: string }> = [];
        console.log(`Found ${results.length} potential websites on page ${page}. Deep-scanning for emails...`);

        // Pool requests for speed while scraping actual websites
        const MAX_CONCURRENT = 3;

        for (let i = 0; i < results.length; i += MAX_CONCURRENT) {
            const batch = results.slice(i, i + MAX_CONCURRENT);
            const batchPromises = batch.map(async (result) => {
                const url = result.url;
                if (this.isBlacklisted(url)) return null;

                try {
                    const email = await this.deepExtractEmail(url);
                    if (email) {
                        const cleanName = this.extractCleanName(url, result.title);
                        console.log(`✅ Found lead: ${email} (${url}) -> Name: ${cleanName}`);
                        return {
                            company: cleanName,
                            url: url,
                            email: email,
                            source: 'web_scrape'
                        };
                    }
                } catch (error) {
                    // Ignore page fetch errors easily
                }
                return null;
            });

            const resolvedBatch = await Promise.all(batchPromises);
            for (const lead of resolvedBatch) {
                if (lead && leads.length < maxResults) {
                    leads.push(lead);
                }
            }
            if (leads.length >= maxResults) break;
        }

        return leads;
    }

    private isBlacklisted(url: string): boolean {
        // Significantly expanded blacklist to filter out directories and focus on small business owners' actual core websites.
        const blacklist = ['yelp.com', 'facebook.com', 'linkedin.com', 'yellowpages.com', 'instagram.com', 'twitter.com', 'youtube.com', 'google.com', 'yahoo.com', 'bing.com', 'bbb.org', 'houzz.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com', 'porch.com', 'expertise.com', 'mapquest.com', 'superpages.com', 'yellowbook.com', 'manta.com', 'chamberofcommerce.com'];
        return blacklist.some(domain => url.includes(domain));
    }

    private extractCleanName(url: string, rawTitle: string): string {
        try {
            let name = rawTitle.split(' | ')[0].split(' - ')[0].trim();
            if (name.includes('http') || name.includes('www.') || name.includes('>') || name.length > 40) {
                const domainObj = new URL(url);
                let hostname = domainObj.hostname.replace('www.', '');
                const parts = hostname.split('.');
                parts.pop(); // remove tld
                name = parts.join(' ');
            }
            const clean = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
            return clean ? clean : "Friend";
        } catch {
            return "Friend";
        }
    }

    private async searchYahoo(query: string, limit: number, page: number): Promise<Array<{ title: string, url: string }>> {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const b = (page - 1) * 10 + 1;
            const response = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=${limit + 5}&b=${b}`, {
                headers: { 'User-Agent': ua }
            });

            const $ = cheerio.load(response.data);
            const results: Array<{ title: string, url: string }> = [];

            $('h3.title a').each((i, element) => {
                const title = $(element).text();
                let url = $(element).attr('href');
                if (url && url.includes('RU=')) {
                    try {
                        const match = url.match(/RU=([^/]+)/);
                        if (match && match[1]) url = decodeURIComponent(match[1]);
                    } catch (e) { }
                }
                if (title && url && url.startsWith('http')) {
                    results.push({ title, url });
                }
            });
            return results.slice(0, limit);
        } catch (error) { return []; }
    }

    private async searchGoogle(query: string, limit: number, page: number): Promise<Array<{ title: string, url: string }>> {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const start = (page - 1) * 10;
            const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit + 5}&start=${start}`, {
                headers: {
                    'User-Agent': ua,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                }
            });

            const $ = cheerio.load(response.data);
            const results: Array<{ title: string, url: string }> = [];

            $('div.g').each((i, element) => {
                const title = $(element).find('h3').first().text();
                const url = $(element).find('a').first().attr('href');
                if (title && url && url.startsWith('http')) {
                    results.push({ title, url });
                }
            });
            return results.slice(0, limit);
        } catch (error) { return []; }
    }

    private async searchBing(query: string, limit: number, page: number): Promise<Array<{ title: string, url: string }>> {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const first = (page - 1) * 10 + 1;
            const response = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit + 5}&first=${first}`, {
                headers: {
                    'User-Agent': ua,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                }
            });

            const $ = cheerio.load(response.data);
            const results: Array<{ title: string, url: string }> = [];

            $('li.b_algo h2 a').each((i, element) => {
                const title = $(element).text();
                const url = $(element).attr('href');
                if (title && url && url.startsWith('http')) {
                    results.push({ title, url });
                }
            });
            return results.slice(0, limit);
        } catch (error) { return []; }
    }

    /**
     * Deep crawl: Check homepage first, then navigate into subpages like a human researcher.
     */
    private async deepExtractEmail(baseUrl: string): Promise<string | null> {
        let email = await this.fetchAndExtractEmail(baseUrl);
        if (email) return email;

        const base = baseUrl.replace(/\/$/, '');
        const subpages = ['/contact', '/contact-us', '/about', '/about-us'];

        for (const sub of subpages) {
            console.log(`   └─ Deep Crawling Subpage: ${base}${sub}`);
            email = await this.fetchAndExtractEmail(`${base}${sub}`);
            if (email) return email;
        }
        return null;
    }

    private async fetchAndExtractEmail(url: string): Promise<string | null> {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout per page

            const response = await axios.get(url, {
                headers: { 'User-Agent': ua },
                signal: controller.signal
            });
            clearTimeout(timeout);

            const html = response.data;
            if (typeof html !== 'string') return null;

            const emailRegex = /([a-zA-Z0-9._-]{2,}@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi;
            const matches = html.match(emailRegex);

            if (matches) {
                const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase()))];
                const validEmails = uniqueEmails.filter(email => {
                    if (email.includes('sentry') || email.includes('example') || email.includes('wixpress') ||
                        email.includes('domain.com') || email.includes('email.com') || email.includes('godaddy') ||
                        email.includes('cloudflare') || email.includes('sitelink') || email.includes('email-protection') ||
                        email.includes('name@') || email.includes('user@') ||
                        (email.includes('admin@') && !email.includes('info'))) return false;

                    if (email.match(/\.(png|jpg|jpeg|gif|svg|css|js|webp|woff|woff2|ttf|eot)$/)) return false;
                    if (email.length > 60 || email.length < 6) return false;
                    return true;
                });

                if (validEmails.length > 0) {
                    const priority = validEmails.find(e =>
                        e.startsWith('info') || e.startsWith('contact') || e.startsWith('hello') || e.startsWith('sales'));
                    return priority || validEmails[0];
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}

export default new WebScraper();
