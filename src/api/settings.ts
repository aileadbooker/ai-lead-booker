import { Router } from 'express';
import db from '../config/database';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

// GET /api/settings/email-config
router.get('/email-config', isAuthenticated, async (req: any, res) => {
    try {
        let userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
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
            return res.status(401).json({ error: 'Unauthorized' });
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
                host: 'smtp.gmail.com',
                port: 465,
                secure: true, // Use Implicit SSL (Port 465)
                requireTLS: true,
                family: 4, // Force IPv4 routing (Bypass macOS ENETUNREACH error)
                auth: {
                    user: googleEmail.trim(),
                    pass: appPassword.trim(),
                },
                connectionTimeout: 15000, // 15 seconds max connection wait
                greetingTimeout: 15000,
                socketTimeout: 15000,
            } as any);
            await testTransporter.verify();
            console.log(`✅ App Password successfully authenticated for ${googleEmail}.`);
        } catch (authError: any) {
            console.error(`❌ Authentication failed:`, authError.message);
            return res.status(401).json({
                error: `Authentication failed. Google said: "${authError.message}". Make sure you typed the exact Google Account Email this password was generated under, and that you do not have any invisible characters copied. You may also need to visit https://accounts.google.com/DisplayUnlockCaptcha from your browser to allow the connection.`
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
