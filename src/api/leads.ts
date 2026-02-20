import express from 'express';
import db from '../config/database';

const router = express.Router();

// GET /api/leads
router.get('/', async (req, res) => {
    try {
        const { search, status, sort } = req.query;
        let query = `SELECT * FROM leads`;
        const params: any[] = [];
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
            query += ` WHERE ` + conditions.join(' AND ');
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
router.post('/', async (req, res) => {
    try {
        const { name, email, company } = req.body;
        // Basic validation
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Check if exists
        const existing = await db.query('SELECT id FROM leads WHERE email = $1', [email]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Lead already exists' });

        const id = require('crypto').randomUUID();

        await db.query(
            `INSERT INTO leads (id, email, name, company, source, status, created_at, updated_at, opted_out, followup_count)
             VALUES ($1, $2, $3, $4, 'manual', 'new', datetime('now'), datetime('now'), 0, 0)`,
            [id, email, name, company]
        );

        res.json({ success: true, id });
    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({ error: 'Failed to create lead' });
    }
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const leadRes = await db.query('SELECT * FROM leads WHERE id = $1', [id]);

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
router.post('/:id/opt-out', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE leads SET status = $1 WHERE id = $2', ['disqualified', id]);
        res.json({ success: true, message: 'Lead opted out' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to opt out' });
    }
});

// POST /api/leads/:id/refresh
router.post('/:id/refresh', async (req, res) => {
    try {
        const { id } = req.params;
        // Mock refresh delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        await db.query('UPDATE leads SET updated_at = datetime("now") WHERE id = $1', [id]);
        res.json({ success: true, message: 'Lead logic refreshed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to refresh logic' });
    }
});

// POST /api/leads/:id/reply (Force AI Reply)
router.post('/:id/reply', async (req, res) => {
    try {
        const { id } = req.params;
        // Check if lead exists first
        const leadRes = await db.query('SELECT * FROM leads WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });

        // Trigger AI processing (Mock for now or hook into leadProcessor)
        // await leadProcessor.processLead(lead); 

        // Return success for UI feedback
        res.json({ success: true, message: 'AI reply queued' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to trigger reply' });
    }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM leads WHERE id = $1', [id]);
        await db.query('DELETE FROM messages WHERE lead_id = $1', [id]);
        res.json({ success: true, message: 'Lead deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete lead' });
    }
});

export default router;
