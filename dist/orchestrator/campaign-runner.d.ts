/**
 * Campaign Runner
 * Manages outbound campaigns, throttling, and sending
 */
declare class CampaignRunner {
    private isRunning;
    private intervalId;
    private llmService;
    private status;
    private currentNiche;
    private dailyLimit;
    private sentToday;
    private lastRunDate;
    constructor();
    /**
     * Start the campaign
     */
    start(niche: string, dailyLimit: number): Promise<void>;
    /**
     * Stop/Pause the campaign
     */
    stop(): void;
    /**
     * Get current stats
     */
    /**
     * Get current stats
     */
    getStats(): Promise<{
        status: "idle" | "running" | "paused";
        niche: string;
        sentToday: number;
        dailyLimit: number;
    }>;
    /**
     * Main processing loop
     */
    private processQueue;
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