import axios from 'axios';
import * as cheerio from 'cheerio';
import { search, SafeSearchType } from 'duck-duck-scrape';

/**
 * Stage 1 & 2: Search & Extract
 * Uses DuckDuckScrape to bypass Google/Bing anti-bot protection and extracts emails + text.
 */
export class WebScraper {
    private readonly USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    ];

    /**
     * Search for leads using DuckDuckGo
     */
    async findLeads(niche: string, maxResults: number = 10, offset: number = 0): Promise<Array<{ company: string, url: string, email?: string, textContent: string, source: string }>> {
        console.log(`🔎 Scraping DDG for: "${niche}" (Offset ${offset})...`);

        let searchResults: Array<{ title: string, url: string }> = [];

        try {
            // DuckDuckScrape does not use traditional "pages" but rather handles scrolling/fetching internally or we can limit it.
            // But we can just use the natural query and take what we need. For deep pagination we modify the query slightly or rely on the engine.
            const ddgResults = await search(niche, {
                safeSearch: SafeSearchType.STRICT
            });

            if (ddgResults.results) {
                // Manually slice to simulate pagination offset
                const sliced = ddgResults.results.slice(offset, offset + maxResults + 10);
                for (const r of sliced) {
                    if (r.url && r.url.startsWith('http') && !this.isBlacklisted(r.url)) {
                        searchResults.push({ title: r.title, url: r.url });
                    }
                }
            }
        } catch (error) {
            console.error('DuckDuckScrape failed:', error);
        }

        const leads: Array<{ company: string, url: string, email?: string, textContent: string, source: string }> = [];
        console.log(`Found ${searchResults.length} potential websites. Deep-scanning for emails and business context...`);

        const MAX_CONCURRENT = 4;

        for (let i = 0; i < searchResults.length; i += MAX_CONCURRENT) {
            const batch = searchResults.slice(i, i + MAX_CONCURRENT);
            const batchPromises = batch.map(async (result) => {
                const url = result.url;

                try {
                    const extracted = await this.deepExtract(url);
                    if (extracted.email) {
                        const cleanName = this.extractCleanName(url, result.title);
                        console.log(`   ✅ Found lead: ${extracted.email} (${url})`);
                        return {
                            company: cleanName,
                            url: url,
                            email: extracted.email,
                            textContent: extracted.text,
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
        const blacklist = ['yelp.com', 'facebook.com', 'linkedin.com', 'yellowpages.com', 'instagram.com', 'twitter.com', 'youtube.com', 'google.com', 'yahoo.com', 'bing.com', 'bbb.org', 'houzz.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com', 'porch.com', 'expertise.com', 'mapquest.com', 'superpages.com', 'yellowbook.com', 'manta.com', 'chamberofcommerce.com', 'wikipedia.org'];
        return blacklist.some(domain => url.toLowerCase().includes(domain));
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

    /**
     * Deep crawl: Check homepage first, then navigate into subpages like a human researcher.
     * Extracts BOTH email and text content for LLM verification.
     */
    private async deepExtract(baseUrl: string): Promise<{ email: string | null, text: string }> {
        let extracted = await this.fetchAndExtract(baseUrl);
        if (extracted.email) return extracted;

        const base = baseUrl.replace(/\/$/, '');
        const subpages = ['/contact', '/contact-us', '/about', '/about-us'];

        for (const sub of subpages) {
            const subExtracted = await this.fetchAndExtract(`${base}${sub}`);
            if (subExtracted.email) {
                // Combine text context from both pages if possible
                return { email: subExtracted.email, text: extracted.text + "\n" + subExtracted.text };
            }
        }

        return extracted;
    }

    private async fetchAndExtract(url: string): Promise<{ email: string | null, text: string }> {
        try {
            const ua = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const response = await axios.get(url, {
                headers: { 'User-Agent': ua },
                signal: controller.signal
            });
            clearTimeout(timeout);

            const html = response.data;
            if (typeof html !== 'string') return { email: null, text: '' };

            const $ = cheerio.load(html);

            // Clean up noise for text extraction
            $('script, style, noscript, iframe, img, svg, video').remove();
            const textContent = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 3000); // 3000 chars is enough for LLM context

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
                    return { email: priority || validEmails[0], text: textContent };
                }
            }
            return { email: null, text: textContent };
        } catch (error) {
            return { email: null, text: '' };
        }
    }
}

export default new WebScraper();
