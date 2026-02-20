import db from '../src/config/database';
import { analyticsTracker } from '../src/analytics/tracker';
import { v4 as uuidv4 } from 'uuid';

/**
 * Seed analytics data for demo purposes
 */
async function seedAnalyticsData() {
    console.log('🌱 Seeding analytics data...');

    // Get existing lead
    const leadsResult = await db.query('SELECT id FROM leads LIMIT 2');
    const leadId = leadsResult.rows[0]?.id as string;

    if (!leadId) {
        console.log('⚠️  No leads found. Run send-test-email.ts first!');
        return;
    }

    // Seed events over the past 7 days
    const eventsToCreate = [
        { type: 'email_sent', count: 15 },
        { type: 'reply_received', count: 8 },
        { type: 'interested', count: 5 },
        { type: 'booked', count: 2 },
        { type: 'not_interested', count: 3 },
        { type: 'disqualified', count: 1 }
    ];

    for (const event of eventsToCreate) {
        for (let i = 0; i < event.count; i++) {
            await analyticsTracker.track(event.type as any, leadId);
        }
    }

    console.log('✅ Analytics data seeded successfully!');
    console.log('📊 Summary:');
    const summary = await analyticsTracker.getSummary();
    console.log(summary);

    process.exit(0);
}

seedAnalyticsData().catch(error => {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
});
