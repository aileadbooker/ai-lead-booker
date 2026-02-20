import db from '../src/config/database';

async function migrate() {
    console.log('🔄 Adding google_app_password column to users table...');

    try {
        await db.query(`ALTER TABLE users ADD COLUMN google_app_password TEXT;`);
        console.log('✅ Column added successfully.');
    } catch (error) {
        if (String(error).includes('duplicate column name')) {
            console.log('⚠️ Column already exists, skipping.');
        } else {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        }
    }

    console.log('Migration complete.');
    process.exit(0);
}

migrate();
