import db from '../src/config/database';

async function cleanup() {
    console.log('🧹 Starting database cleanup...');

    try {
        const res = await db.query('SELECT id, email FROM leads');
        console.log(`Checking ${res.rows.length} leads...`);

        const idsToDelete: string[] = [];

        for (const row of res.rows) {
            const email = row.email.toLowerCase();
            let isValid = true;

            // Re-use logic from scraper
            if (!email.includes('@') || !email.includes('.')) isValid = false;
            if (email.includes('sentry') ||
                email.includes('example') ||
                email.includes('wixpress') ||
                email.includes('domain.com') ||
                email.includes('email.com') ||
                email.includes('godaddy') ||
                email.includes('name@') ||
                email.includes('user@') ||
                email.includes('admin@') && !email.includes('info')) isValid = false;

            if (email.match(/\.(png|jpg|jpeg|gif|svg|css|js|webp)$/)) isValid = false;

            if (!isValid) {
                console.log(`❌ Invalid lead found: ${email} (${row.id})`);
                idsToDelete.push(row.id);
            }
        }

        if (idsToDelete.length > 0) {
            console.log(`Deleting ${idsToDelete.length} invalid leads...`);
            // SQLite safe delete
            for (const id of idsToDelete) {
                await db.query('DELETE FROM leads WHERE id = $1', [id]);
            }
            console.log('✅ Cleanup complete.');
        } else {
            console.log('✅ No invalid leads found.');
        }

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

cleanup();
