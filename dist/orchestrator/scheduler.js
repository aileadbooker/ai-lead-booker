"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowupScheduler = void 0;
const database_1 = __importDefault(require("../config/database"));
const lead_processor_1 = __importDefault(require("./lead-processor"));
/**
 * Follow-up Scheduler
 * Background service that scans for leads requiring automated follow-ups
 */
class FollowupScheduler {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
    }
    /**
     * Start the scheduler
     */
    start(intervalMs = 300000) {
        console.log(`Starting follow-up scheduler (scanning every ${intervalMs / 1000}s)...`);
        // Initial scan
        this.scan();
        this.intervalId = setInterval(() => {
            this.scan();
        }, intervalMs);
    }
    /**
     * Stop the scheduler
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Follow-up scheduler stopped');
        }
    }
    /**
     * Scan database for leads due for follow-up
     */
    async scan() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        try {
            console.log('--- Scanning for pending follow-ups ---');
            // Find leads where next_action_at is in the past and they aren't opted out
            const result = await database_1.default.query(`SELECT * FROM leads 
                 WHERE next_action_at IS NOT NULL 
                 AND next_action_at <= datetime('now')
                 AND opted_out = 0 
                 AND status != 'closed' 
                 AND status != 'escalated'
                 LIMIT 10`);
            if (result.rows.length === 0) {
                console.log('No pending follow-ups');
                this.isRunning = false;
                return;
            }
            console.log(`Found ${result.rows.length} lead(s) due for follow-up`);
            for (const lead of result.rows) {
                try {
                    console.log(`Triggering follow-up for: ${lead.email}`);
                    await lead_processor_1.default.processLead(lead, true);
                }
                catch (error) {
                    console.error(`Error processing follow-up for ${lead.email}:`, error);
                }
            }
            console.log('--- Follow-up scan complete ---');
        }
        catch (error) {
            console.error('Error during follow-up scan:', error);
        }
        finally {
            this.isRunning = false;
        }
    }
}
exports.FollowupScheduler = FollowupScheduler;
exports.default = new FollowupScheduler();
//# sourceMappingURL=scheduler.js.map