
import db from '../src/config/database';
import { analyticsTracker } from '../src/analytics/tracker';

async function syncAnalytics() {
    console.log('🔄 Syncing Analytics Events...');

    try {
        // 1. Find leads that are 'contacted'
        const contactedLeads = await db.query(
            `SELECT id, email, last_contact_at FROM leads WHERE status = 'contacted'`
        );

        console.log(`Found ${contactedLeads.rows.length} contacted leads.`);

        for (const lead of contactedLeads.rows) {
            // 2. Check if they have an 'email_sent' event
            const event = await db.query(
                `SELECT id FROM analytics_events 
                 WHERE lead_id = $1 AND event_type = 'email_sent'`,
                [lead.id]
            );

            if (event.rows.length === 0) {
                console.log(`⚠️ Missing event for ${lead.email}. Backfilling...`);

                // Backfill event
                await analyticsTracker.track('email_sent', lead.id);

                // If we want to be precise, we could manually insert with the correct timestamp, 
                // but track() uses now(). For MVP this is fine.
            } else {
                console.log(`✅ Event exists for ${lead.email}`);
            }
        }

        console.log('✨ Sync Complete.');

    } catch (error) {
        console.error('Sync failed:', error);
    }
}

syncAnalytics();
