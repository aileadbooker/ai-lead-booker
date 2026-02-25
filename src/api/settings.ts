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

import nodemailer from 'nodemailer';

// POST /api/settings/email-config
router.post('/email-config', isAuthenticated, async (req: any, res) => {
    try {
        let userId = req.user?.id;
        let userEmail = req.user?.email;
        if (!userId) {
            const firstUser = await db.query('SELECT id, email FROM users LIMIT 1');
            if (firstUser.rows.length > 0) {
                userId = firstUser.rows[0].id;
                userEmail = firstUser.rows[0].email;
            } else {
                // Database holds no users, create a default admin user
                const newId = 'usr_admin_' + Date.now();
                await db.query(
                    `INSERT INTO users (id, email, name, has_paid, onboarding_completed) VALUES ($1, 'admin@admin.com', 'Admin', 1, 1)`,
                    [newId]
                );
                userId = newId;
                userEmail = 'admin@admin.com';
            }
        }

        const { appPassword, googleEmail } = req.body;

        if (!appPassword || typeof appPassword !== 'string') {
            return res.status(400).json({ error: 'App Password is required' });
        }
        if (!googleEmail || typeof googleEmail !== 'string' || !googleEmail.includes('@')) {
            return res.status(400).json({ error: 'Valid Google Email is required' });
        }

        // VERIFICATION: Actually test the Google App Password BEFORE saving
        console.log(`Verifying Google App Password for explicit email account: ${googleEmail}...`);
        try {
            const testTransporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: googleEmail.trim(), // Use the explicitly provided address!
                    pass: appPassword.trim(),
                },
            });
            await testTransporter.verify();
            console.log(`✅ App Password successfully authenticated for ${googleEmail}.`);
        } catch (authError: any) {
            console.error(`❌ Authentication failed:`, authError.message);
            return res.status(401).json({
                error: 'Authentication failed. Google rejected this password. Make sure you typed the exact Google Account Email this password was generated under.'
            });
        }

        // Save to DB
        await db.query(
            `UPDATE users SET google_app_password = $1, google_account_email = $2, updated_at = datetime('now') WHERE id = $3`,
            [appPassword.trim(), googleEmail.trim(), userId]
        );

        console.log(`✅ App Password configured and securely bound to ${googleEmail}`);

        res.json({ success: true, message: 'Email configuration saved successfully' });
    } catch (error) {
        console.error('Failed to save email config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
