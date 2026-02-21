"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/settings/email-config
router.get('/email-config', auth_1.isAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await database_1.default.query('SELECT google_app_password FROM users WHERE id = $1', [userId]);
        const hasPassword = result.rows.length > 0 && !!result.rows[0].google_app_password;
        res.json({
            configured: hasPassword,
            email: req.user.email
        });
    }
    catch (error) {
        console.error('Failed to fetch email config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/settings/email-config
router.post('/email-config', auth_1.isAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id;
        const { appPassword } = req.body;
        if (!appPassword || typeof appPassword !== 'string') {
            return res.status(400).json({ error: 'App Password is required' });
        }
        // Save to DB
        await database_1.default.query(`UPDATE users SET google_app_password = $1, updated_at = datetime('now') WHERE id = $2`, [appPassword.trim(), userId]);
        console.log(`✅ App Password updated for user ${req.user.email}`);
        res.json({ success: true, message: 'Email configuration saved successfully' });
    }
    catch (error) {
        console.error('Failed to save email config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map