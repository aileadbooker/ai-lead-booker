/**
 * Follow-up Scheduler
 * Background service that scans for leads requiring automated follow-ups
 */
export declare class FollowupScheduler {
    private intervalId;
    private isRunning;
    /**
     * Start the scheduler
     */
    start(intervalMs?: number): void;
    /**
     * Stop the scheduler
     */
    stop(): void;
    /**
     * Scan database for leads due for follow-up
     */
    private scan;
}
declare const _default: FollowupScheduler;
export default _default;
//# sourceMappingURL=scheduler.d.ts.map