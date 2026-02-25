/**
 * Robust Web Scraper 🕵️‍♂️
 * Rotates User-Agents and tries multiple search engines.
 * Feature Update: Deep-Crawling and Search Pagination for 10x Volume.
 */
export declare class WebScraper {
    private readonly USER_AGENTS;
    /**
     * Search for leads
     */
    findLeads(niche: string, maxResults?: number, page?: number): Promise<Array<{
        company: string;
        url: string;
        email?: string;
        source: string;
    }>>;
    private isBlacklisted;
    private extractCleanName;
    private searchYahoo;
    private searchGoogle;
    private searchBing;
    /**
     * Deep crawl: Check homepage first, then navigate into subpages like a human researcher.
     */
    private deepExtractEmail;
    private fetchAndExtractEmail;
}
declare const _default: WebScraper;
export default _default;
//# sourceMappingURL=scraper.d.ts.map