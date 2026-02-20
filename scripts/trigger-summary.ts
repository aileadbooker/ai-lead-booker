import dailyReporter from '../src/orchestrator/daily-reporter';
import db from '../src/config/database';

async function main() {
    console.log('🚀 Triggering Daily Summary Email manually...');

    try {
        await dailyReporter.triggerNow();
        console.log('✅ Daily Summary Email process completed successfully.');
    } catch (error) {
        console.error('❌ Failed to trigger daily summary:', error);
    } finally {
        // Close database connection to allow script to exit
        // Note: db.pool might not be exposed directly, so we might force exit
        console.log('Done.');
        process.exit(0);
    }
}

main();
