"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/**
 * Application configuration loaded from environment variables
 */
exports.config = {
    // Server
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    // Database
    databaseUrl: process.env.DATABASE_URL || '',
    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY,
    // Google OAuth
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
    // Google Cloud
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    // Gmail
    gmailUserEmail: process.env.GMAIL_USER_EMAIL || '',
    // Business Config
    businessName: process.env.BUSINESS_NAME || 'AI Lead Booker',
    businessConfigId: process.env.BUSINESS_CONFIG_ID || '',
    // Feature Flags
    useMockLlm: process.env.USE_MOCK_LLM === 'true',
    enableRealEmail: process.env.ENABLE_REAL_EMAIL === 'true',
    // Email Credentials
    smtp: {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587'),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
    imap: {
        host: process.env.IMAP_HOST || '',
        port: parseInt(process.env.IMAP_PORT || '993'),
        user: process.env.IMAP_USER || '',
        pass: process.env.IMAP_PASS || '',
    },
    // Session
    sessionSecret: process.env.SESSION_SECRET || 'secret-key-change-me',
};
/**
 * Validate required environment variables
 */
function validateConfig() {
    const missing = [];
    // Core Requirements
    if (!process.env.DATABASE_URL)
        missing.push('DATABASE_URL');
    if (!process.env.GMAIL_USER_EMAIL)
        missing.push('GMAIL_USER_EMAIL');
    // OpenAI Requirement (skip if mock mode)
    if (!exports.config.useMockLlm && !process.env.OPENAI_API_KEY) {
        missing.push('OPENAI_API_KEY');
    }
    // Email Integration Requirements (skip if real email not enabled)
    if (exports.config.enableRealEmail) {
        if (!process.env.SMTP_HOST)
            missing.push('SMTP_HOST');
        if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your-email'))
            missing.push('SMTP_USER');
        if (!process.env.SMTP_PASS || process.env.SMTP_PASS.includes('your-app-password'))
            missing.push('SMTP_PASS');
        if (!process.env.IMAP_HOST)
            missing.push('IMAP_HOST');
    }
    else {
        // If not using real email, check for Google Credentials (legacy/simulator mode)
        // We warn but don't fail for Google creds if they are missing in Simulator mode
        const googleRequired = [
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GOOGLE_REFRESH_TOKEN',
            'GOOGLE_REDIRECT_URI',
        ];
        const missingGoogle = googleRequired.filter((key) => !process.env[key]);
        if (missingGoogle.length > 0) {
            console.warn('⚠️ Google Cloud credentials missing. Gmail/Calendar integration will not work (Simulator Mode only).');
        }
    }
    if (missing.length > 0) {
        console.warn('⚠️ Missing configuration variables (App will continue without them):', missing);
    }
    return { valid: true, missing };
}
exports.default = exports.config;
//# sourceMappingURL=index.js.map