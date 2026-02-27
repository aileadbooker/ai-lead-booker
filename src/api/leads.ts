import express from 'express';
import db from '../config/database';
import leadProcessor from '../orchestrator/lead-processor';

const router = express.Router();

// GET /api/leads
router.get('/', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const { search, status, sort } = req.query;
        let query = `SELECT * FROM leads WHERE user_id = $1`;
        const params: any[] = [userId];
        const conditions: string[] = [];

        // Search Filter
        if (search) {
            const p1 = params.length + 1;
            const p2 = params.length + 2;
            const p3 = params.length + 3;
            conditions.push(`(name LIKE $${p1} OR email LIKE $${p2} OR company LIKE $${p3})`);
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Status Filter
        if (status && status !== 'all') {
            conditions.push(`status = $${params.length + 1}`);
            params.push(status);
        }

        if (conditions.length > 0) {
            query += ` AND ` + conditions.join(' AND ');
        }

        // Sorting
        if (sort === 'updated_asc') query += ` ORDER BY last_contact_at ASC`;
        else if (sort === 'created_desc') query += ` ORDER BY created_at DESC`;
        else if (sort === 'created_asc') query += ` ORDER BY created_at ASC`;
        else query += ` ORDER BY last_contact_at DESC`; // Default

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

// POST /api/leads (Manual Create)
router.post('/', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const { name, email, company } = req.body;
        // Basic validation
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Check if exists for this user
        const existing = await db.query('SELECT id FROM leads WHERE email = $1 AND user_id = $2', [email, userId]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Lead already exists' });

        const id = require('crypto').randomUUID();

        await db.query(
            `INSERT INTO leads (id, user_id, email, name, company, source, status, created_at, updated_at, opted_out, followup_count)
             VALUES ($1, $2, $3, $4, $5, 'manual', 'new', datetime('now'), datetime('now'), 0, 0)`,
            [id, userId, email, name, company]
        );

        res.json({ success: true, id });
    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({ error: 'Failed to create lead' });
    }
});

// GET /api/leads/:id
router.get('/:id', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const leadRes = await db.query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [id, userId]);

        if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });

        const messagesRes = await db.query(
            'SELECT * FROM messages WHERE lead_id = $1 ORDER BY sent_at DESC',
            [id]
        );

        res.json({ lead: leadRes.rows[0], messages: messagesRes.rows });
    } catch (error) {
        console.error('Error fetching lead details:', error);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
});

// POST /api/leads/:id/opt-out
router.post('/:id/opt-out', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        await db.query('UPDATE leads SET status = $1 WHERE id = $2 AND user_id = $3', ['disqualified', id, userId]);
        res.json({ success: true, message: 'Lead opted out' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to opt out' });
    }
});

// POST /api/leads/:id/refresh
router.post('/:id/refresh', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        // Mock refresh delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        await db.query('UPDATE leads SET updated_at = datetime("now") WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ success: true, message: 'Lead logic refreshed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to refresh logic' });
    }
});

// POST /api/leads/:id/reply (Force AI Reply)
router.post('/:id/reply', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        // Check if lead exists first
        const leadRes = await db.query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [id, userId]);
        if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });

        const leadRow = leadRes.rows[0];

        // Define Lead object locally mapping to DB schema
        const lead = {
            id: leadRow.id,
            user_id: leadRow.user_id,
            email: leadRow.email,
            name: leadRow.name,
            phone: leadRow.phone,
            company: leadRow.company,
            source: leadRow.source,
            status: leadRow.status,
            opted_out: leadRow.opted_out === 1 || leadRow.opted_out === true,
            followup_count: leadRow.followup_count || 0,
            last_contact_at: leadRow.last_contact_at ? new Date(leadRow.last_contact_at) : undefined,
            next_action_at: leadRow.next_action_at ? new Date(leadRow.next_action_at) : undefined,
            created_at: new Date(leadRow.created_at),
            updated_at: new Date(leadRow.updated_at),
        };

        // Fire and forget AI processing (do not block the UI)
        leadProcessor.processLead(lead as any, true).catch(err => {
            console.error('Error in background manual forced reply:', err);
        });

        // Return success for UI feedback immediately
        res.json({ success: true, message: 'AI reply queued' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to trigger reply' });
    }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;

        // Ensure ownership
        const lead = await db.query('SELECT id FROM leads WHERE id = $1 AND user_id = $2', [id, userId]);
        if (lead.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });

        await db.query('DELETE FROM leads WHERE id = $1', [id]);
        await db.query('DELETE FROM messages WHERE lead_id = $1', [id]);
        res.json({ success: true, message: 'Lead deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete lead' });
    }
});

export default router;
