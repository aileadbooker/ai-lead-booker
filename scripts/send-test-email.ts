
import emailService from '../src/ingestion/email-service';
import { v4 as uuidv4 } from 'uuid';
import db from '../src/config/database';
import dotenv from 'dotenv';
dotenv.config();

const targetEmail = 'kjjr0723yes@gmail.com';

async function sendTest() {
    console.log(`Sending cold email to ${targetEmail}...`);

    // Simulate a lead creation to track it
    // Check if lead exists
    let leadId;
    const existing = await db.query('SELECT id FROM leads WHERE email = $1', [targetEmail]);

    if (existing.rows.length > 0) {
        leadId = existing.rows[0].id;
        console.log(`Using existing lead: ${leadId}`);
    } else {
        leadId = uuidv4();
        await db.query(`INSERT INTO leads (id, email, name, source, status, created_at, updated_at) 
                        VALUES ($1, $2, 'Kevin', 'manual_outbound', 'new', datetime('now'), datetime('now'))`,
            [leadId, targetEmail]);
        console.log(`Created new lead: ${leadId}`);
    }

    const result = await emailService.sendEmail(
        { id: leadId, email: targetEmail } as any,
        'Quick Question about your project',
        `Hey there! 👋

I'd like to approach you with an incredible opportunity - our AI Lead Booker that can automate your sales outreach 24/7, qualify leads, and book calls while you sleep! 🚀

This AI handles:
• Intelligent email conversations
• Lead qualification  
• Calendar booking
• Follow-up sequences

Would you be interested in learning more?

**Y for YES and N for NO**`
    );

    if (result.sent) {
        console.log('✅ Email sent successfully!');
    } else {
        console.error('❌ Failed to send:', result.reason);
    }
}

sendTest().catch(console.error);
