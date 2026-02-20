import db from '../src/config/database';

(async () => {
    try {
        console.log('Migrating database...');
        await db.query(`ALTER TABLE business_config ADD COLUMN stripe_customer_id TEXT`);
        console.log('Added stripe_customer_id column.');
    } catch (error: any) {
        if (error.message.includes('duplicate column')) {
            console.log('Column already exists.');
        } else {
            console.error('Migration failed:', error);
        }
    }
})();
