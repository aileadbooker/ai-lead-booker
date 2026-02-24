import { Router } from 'express';
import db from '../config/database';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

// GET /api/settings/email-config
router.get('/email-config', isAuthenticated, async (req: any, res) => {
    try {
        let userId = req.user?.id;
        if (!userId) {
            const firstUser = await db.query('SELECT id FROM users LIMIT 1');
            if (firstUser.rows.length > 0) userId = firstUser.rows[0].id;
            else return res.json({ configured: false, email: 'admin' });
        }

        const result = await db.query('SELECT google_app_password FROM users WHERE id = $1', [userId]);
        const hasPassword = result.rows.length > 0 && !!result.rows[0].google_app_password;

        res.json({
            configured: hasPassword,
            email: req.user?.email || 'admin'
        });
    } catch (error) {
        console.error('Failed to fetch email config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/settings/email-config
router.post('/email-config', isAuthenticated, async (req: any, res) => {
    try {
        let userId = req.user?.id;
        if (!userId) {
            const firstUser = await db.query('SELECT id FROM users LIMIT 1');
            if (firstUser.rows.length > 0) {
                userId = firstUser.rows[0].id;
            } else {
                // Database holds no users, create a default admin user
                const newId = 'usr_admin_' + Date.now();
                await db.query(
                    `INSERT INTO users (id, email, name, has_paid, onboarding_completed) VALUES ($1, 'admin@admin.com', 'Admin', 1, 1)`,
                    [newId]
                );
                userId = newId;
            }
        }

        const { appPassword } = req.body;

        if (!appPassword || typeof appPassword !== 'string') {
            return res.status(400).json({ error: 'App Password is required' });
        }

        // Save to DB
        await db.query(
            `UPDATE users SET google_app_password = $1, updated_at = datetime('now') WHERE id = $2`,
            [appPassword.trim(), userId]
        );

        console.log(`✅ App Password updated for user ${req.user?.email || 'admin'}`);

        res.json({ success: true, message: 'Email configuration saved successfully' });
    } catch (error) {
        console.error('Failed to save email config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
