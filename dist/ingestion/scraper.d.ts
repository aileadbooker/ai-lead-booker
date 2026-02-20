/**
 * Robust Web Scraper 🕵️‍♂️
 * Rotates User-Agents and tries multiple search engines.
 */
export declare class WebScraper {
    private readonly USER_AGENTS;
    /**
     * Search for leads
     */
    findLeads(niche: string, maxResults?: number): Promise<Array<{
        company: string;
        url: string;
        email?: string;
        source: string;
    }>>;
    private isBlacklisted;
    /**
     * Scrape Yahoo
     */
    private searchYahoo;
    /**
     * Scrape Google
     */
    private searchGoogle;
    /**
     * Scrape Bing
     */
    private searchBing;
    private extractEmailFromSite;
}
declare const _default: WebScraper;
export default _default;
//# sourceMappingURL=scraper.d.ts.map