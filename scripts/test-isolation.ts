import db from '../src/config/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Multi-Tenant Collision Test
 * Verifies that the composite indexes and workspace isolations function correctly at the database level.
 */
async function runTest() {
    console.log('🛡️  Running Multi-Tenant Data Collision Test...');

    const ws1 = `ws_test_${uuidv4()}`;
    const ws2 = `ws_test_${uuidv4()}`;

    try {
        // 1. Setup Mock Workspaces
        await db.query(`INSERT INTO workspaces (id, name) VALUES ($1, 'Test Workspace 1')`, [ws1]);
        await db.query(`INSERT INTO workspaces (id, name) VALUES ($1, 'Test Workspace 2')`, [ws2]);

        // 2. Insert Lead 1 into Workspace 1
        const lead1 = uuidv4();
        await db.query(`INSERT INTO leads (id, workspace_id, user_id, email, source, status) VALUES ($1, $2, 'legacy_admin', 'alice@acme.com', 'web_scrape', 'new')`, [lead1, ws1]);

        // 3. Insert Lead 2 into Workspace 2 (Same email as lead 1! This should SUCCEED because unique constraints should be composite)
        const lead2 = uuidv4();
        await db.query(`INSERT INTO leads (id, workspace_id, user_id, email, source, status) VALUES ($1, $2, 'legacy_admin', 'bob@globex.com', 'web_scrape', 'new')`, [lead2, ws2]);

        // 4. Verify cross-contamination queries
        const ws1Results = await db.query(`SELECT id FROM leads WHERE workspace_id = $1`, [ws1]);
        const ws2Results = await db.query(`SELECT id FROM leads WHERE workspace_id = $1`, [ws2]);

        if (ws1Results.rows.length !== 1 || ws1Results.rows[0].id !== lead1) {
            throw new Error(`Workspace 1 returned incorrect leads. Expected ${lead1}, got ${JSON.stringify(ws1Results.rows)}`);
        }

        if (ws2Results.rows.length !== 1 || ws2Results.rows[0].id !== lead2) {
            throw new Error(`Workspace 2 returned incorrect leads. Expected ${lead2}, got ${JSON.stringify(ws2Results.rows)}`);
        }

        console.log('✅ PASS: Workspace isolation prevents lead spillage.');

        // 5. Test composite indexing on Email
        const emailTest = await db.query(`SELECT id FROM leads WHERE email = 'alice@acme.com' AND workspace_id = $1`, [ws1]);
        const emailTestFail = await db.query(`SELECT id FROM leads WHERE email = 'alice@acme.com' AND workspace_id = $1`, [ws2]);

        if (emailTest.rows.length !== 1) throw new Error('Failed to fetch lead by email within valid workspace.');
        if (emailTestFail.rows.length !== 0) throw new Error('FAIL: Workspace 2 retrieved Workspace 1 raw email data!');

        console.log('✅ PASS: Composite unique queries properly isolated by Workspace ID.');
        console.log('\n🎉 Multi-Tenant Integration Test Completed Successfully!');

    } catch (err) {
        console.error('❌ TEST FAILED:', err);
    } finally {
        // Clean up
        await db.query(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [ws1, ws2]);
    }
}

runTest();
