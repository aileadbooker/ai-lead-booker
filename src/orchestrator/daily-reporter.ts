import { SummaryGenerator } from '../analytics/summary-generator';

class DailyReporter {
    private generator: SummaryGenerator;
    private intervalId: NodeJS.Timeout | null = null;

    constructor() {
        this.generator = new SummaryGenerator();
    }

    /**
     * Start the daily reporter (Checks every hour if it's 7 AM)
     */
    start() {
        console.log('Starting daily reporter scheduler...');

        // Check immediately
        this.checkAndSend();

        // Check every hour
        this.intervalId = setInterval(() => {
            this.checkAndSend();
        }, 60 * 60 * 1000);
    }

    private async checkAndSend() {
        const now = new Date();
        // Run only at 7 AM
        if (now.getHours() === 7) {
            console.log('🕖 It is 7 AM - Generating daily summary...');
            await this.generator.generateAndSend();
        }
    }

    /**
     * Manual Trigger (for testing)
     */
    async triggerNow() {
        console.log('Force triggering daily summary...');
        await this.generator.generateAndSend();
    }
}

export default new DailyReporter();
