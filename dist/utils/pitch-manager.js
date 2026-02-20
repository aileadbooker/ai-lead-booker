"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PitchManager = void 0;
const database_1 = __importDefault(require("../config/database"));
/**
 * Pitch Manager - Loads custom pitch templates from database
 */
class PitchManager {
    /**
     * Get custom pitch configuration
     */
    static async getPitch() {
        try {
            // Use cached version if available (valid for 5 minutes)
            if (this.cachedPitch) {
                return this.cachedPitch;
            }
            const result = await database_1.default.query(`SELECT * FROM custom_pitch WHERE id = 'default'`);
            if (result.rows.length > 0) {
                this.cachedPitch = result.rows[0];
                return this.cachedPitch;
            }
            // Return defaults if not found
            return this.getDefaults();
        }
        catch (error) {
            console.error('Failed to load custom pitch:', error);
            return this.getDefaults();
        }
    }
    /**
     * Get AI-recommended defaults
     */
    static getDefaults() {
        return {
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
            yes_2_response: `**That's the spirit!** 🙌 You won't regret this!

Let's get you set up with a demo. Click below to book your call:

🔗 **[Book Your Demo Call](https://example.com/book)**

Or check out our website:
🌐 **[Visit Our Website](https://example.com)**

Can't wait to show you the magic! ✨`,
            no_2_response: `**Thank you for your time!** 🙏

I completely understand. If you have any questions in the future, feel free to visit our Q&A page:

📚 **[Visit Our Q&A](https://example.com/qa)**

Wishing you all the best with your business! 🚀`
        };
    }
    /**
     * Clear cache (call this after pitch updates)
     */
    static clearCache() {
        this.cachedPitch = null;
    }
    /**
     * Replace {{name}} placeholder
     */
    static replaceName(text, name) {
        return text.replace(/\{\{name\}\}/g, name || 'there');
    }
}
exports.PitchManager = PitchManager;
PitchManager.cachedPitch = null;
//# sourceMappingURL=pitch-manager.js.map