/**
 * Campaign Runner
 * Manages outbound campaigns, throttling, and sending for all users
 */
declare class CampaignRunner {
    private intervalId;
    private llmService;
    private isProcessingQueue;
    constructor();
    /**
     * Initialize master campaign runner
     */
    init(): Promise<void>;
    /**
     * Start the campaign for a specific user
     */
    start(userId: string, niche: string, dailyLimit: number): Promise<void>;
    /**
     * Stop/Pause the campaign for a specific user
     */
    stop(userId: string): Promise<void>;
    /**
     * Get current stats for a specific user
     */
    getStats(userId: string): Promise<{
        status: string;
        niche: string;
        sentToday: number;
        dailyLimit: number;
        active: boolean;
    }>;
    /**
     * Main processing loop across all users
     */
    private processAllQueues;
    /**
     * Process outreach for a single user
     */
    private processUserQueue;
    /**
     * Send the first email to a lead
     */
    private sendInitialOutreach;
    /**
     * Convert markdown-style text to HTML
     */
    private formatEmailBody;
}
declare const _default: CampaignRunner;
export default _default;
//# sourceMappingURL=campaign-runner.d.ts.map