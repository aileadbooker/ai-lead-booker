import { Router, Request, Response } from 'express';
import db from '../config/database';

const router = Router();

export const DEFAULT_PITCH = {
    initial_pitch: `Hey {{name}}! 👋

I'd like to approach you with an incredible opportunity - our **AI Lead Booker** that can automate your sales outreach 24/7, qualify leads, and book calls while you sleep! 🚀

This AI handles:
• Intelligent email conversations
• Lead qualification
• Calendar booking
• Follow-up sequences

**Would you be interested in learning more?**

**Y for YES | N for NO**`,
    yes_response: `**Excellent!** 🎉 I'm so excited to show you what our AI can do!

I've booked you in for a demo call. Click the link below to choose your preferred time:

🔗 **[Book Your Demo Call](https://example.com/book)**

Or visit our website to learn more:
🌐 **[Visit Our Website](https://example.com)**

Looking forward to speaking with you! 📞`,
    no_response: `I understand! But before you go... 🤔

**Are you sure?** Think about this:
• You could be closing deals while you sleep 😴💰
• Our AI handles 100+ leads simultaneously
• Businesses using our AI see **3x more bookings**
• Setup takes less than 10 minutes

**Give it one more thought - would you like to see a quick demo?**

**Y for YES | N for NO**`,
    yes_2_response: `**That's the spirit!** 🙌 Let's book your call: [link]

**Y for YES | N for NO**`,
    no_2_response: `**Thank you for your time!** 🙏 Visit our Q&A: [link]`
};

/**
 * GET /api/pitch
 * Get current custom pitch configuration
 */
router.get('/pitch', async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            `SELECT * FROM custom_pitch WHERE id = 'default'`
        );

        if (result.rows.length === 0) {
            return res.json(DEFAULT_PITCH);
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching pitch:', error);
        res.status(500).json({ error: 'Failed to fetch pitch' });
    }
});

/**
 * PUT /api/pitch
 * Update custom pitch configuration
 */
router.put('/pitch', async (req: Request, res: Response) => {
    try {
        const { initial_pitch, yes_response, no_response, yes_2_response, no_2_response } = req.body;

        // Validate required fields
        if (!initial_pitch || !yes_response || !no_response) {
            return res.status(400).json({ error: 'All pitch fields are required' });
        }

        await db.query(
            `INSERT INTO custom_pitch (id, initial_pitch, yes_response, no_response, updated_at)
             VALUES ('default', $1, $2, $3, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                 initial_pitch = excluded.initial_pitch,
                 yes_response = excluded.yes_response,
                 no_response = excluded.no_response,
                 updated_at = excluded.updated_at`,
            [initial_pitch, yes_response, no_response]
        );

        res.json({ success: true, message: 'Pitch updated successfully' });
    } catch (error) {
        console.error('Error updating pitch:', error);
        res.status(500).json({ error: 'Failed to update pitch' });
    }
});

/**
 * POST /api/pitch/reset
 * Reset to AI-recommended defaults
 */
router.post('/pitch/reset', async (req: Request, res: Response) => {
    try {
        console.log('[DEBUG] POST /api/pitch/reset triggered');

        await db.query(
            `INSERT INTO custom_pitch (id, initial_pitch, yes_response, no_response, yes_2_response, no_2_response, updated_at)
             VALUES ('default', $1, $2, $3, $4, $5, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                 initial_pitch = excluded.initial_pitch,
                 yes_response = excluded.yes_response,
                 no_response = excluded.no_response,
                 yes_2_response = excluded.yes_2_response,
                 no_2_response = excluded.no_2_response,
                 updated_at = excluded.updated_at`,
            [DEFAULT_PITCH.initial_pitch, DEFAULT_PITCH.yes_response, DEFAULT_PITCH.no_response,
            DEFAULT_PITCH.yes_2_response, DEFAULT_PITCH.no_2_response]
        );

        res.json({ success: true, message: 'Reset to AI-recommended defaults', pitch: DEFAULT_PITCH });
    } catch (error) {
        console.error('Error resetting pitch:', error);
        res.status(500).json({ error: 'Failed to reset pitch' });
    }
});

export default router;
