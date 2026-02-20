declare class DailyReporter {
    private generator;
    private intervalId;
    constructor();
    /**
     * Start the daily reporter (Checks every hour if it's 7 AM)
     */
    start(): void;
    private checkAndSend;
    /**
     * Manual Trigger (for testing)
     */
    triggerNow(): Promise<void>;
}
declare const _default: DailyReporter;
export default _default;
//# sourceMappingURL=daily-reporter.d.ts.map