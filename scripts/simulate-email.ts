import leadProcessor from '../src/orchestrator/lead-processor';
import db from '../src/config/database';
import { v4 as uuidv4 } from 'uuid';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function simulate() {
    console.log('\n--- 📧 AI Lead Booker Simulator ---');

    const email = await askQuestion('Lead Email (e.g., test@example.com): ') || 'test@example.com';
    const name = await askQuestion('Lead Name: ') || 'Test User';
    const body = await askQuestion('Email Body: ');

    if (!body) {
        console.log('❌ Error: Email body is required.');
        process.exit(1);
    }

    try {
        // 1. Get or Create Lead
        let lead;
        const existing = await db.query('SELECT * FROM leads WHERE email = $1', [email]);

        if (existing.rows.length > 0) {
            lead = existing.rows[0];
            console.log(`\nExisting lead found: ${lead.id}`);
        } else {
            const id = uuidv4();
            await db.query(
                'INSERT INTO leads (id, email, name, source, status, created_at) VALUES ($1, $2, $3, $4, $5, datetime(\'now\'))',
                [id, email, name, 'email', 'new']
            );
            const res = await db.query('SELECT * FROM leads WHERE id = $1', [id]);
            lead = res.rows[0];
            console.log(`\nNew lead created: ${lead.id}`);
        }

        // 2. Inject Message
        const msgId = uuidv4();
        await db.query(
            `INSERT INTO messages (id, lead_id, direction, subject, body, sent_at) 
       VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
            [msgId, lead.id, 'inbound', 'Inquiry', body]
        );
        console.log(`Message injected into database.`);

        // 3. Trigger Processor
        console.log(`\n--- 🧠 Triggering Lead Processor ---\n`);
        const leadWithTypedFields = {
            ...lead,
            opted_out: lead.opted_out === 1 || lead.opted_out === true,
            followup_count: lead.followup_count || 0
        };
        await leadProcessor.processLead(leadWithTypedFields as any);

        console.log(`\n--- ✅ Simulation Complete ---`);
        console.log(`Check your 'database.sqlite' or 'action_log' table to see the drafted response.`);

    } catch (err) {
        console.error('❌ Simulation failed:', err);
    } finally {
        process.exit(0);
    }
}

function askQuestion(query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

simulate();
