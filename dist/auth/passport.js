"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const config_1 = require("../config");
const database_1 = __importDefault(require("../config/database"));
passport_1.default.serializeUser((user, done) => {
    done(null, user.id);
});
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const result = await database_1.default.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            done(null, result.rows[0]);
        }
        else {
            done(null, null);
        }
    }
    catch (error) {
        done(error, null);
    }
});
if (config_1.config.googleClientId && config_1.config.googleClientSecret) {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: config_1.config.googleClientId,
        clientSecret: config_1.config.googleClientSecret,
        callbackURL: config_1.config.googleCallbackUrl || '/auth/google/callback',
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
        passReqToCallback: true,
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0].value;
            const googleId = profile.id;
            const name = profile.displayName;
            const photo = profile.photos?.[0].value;
            // Check if user exists
            let user = await database_1.default.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
            if (user.rows.length === 0) {
                // Create new user
                const uuidHook = require('uuid');
                const newId = uuidHook.v4();
                await database_1.default.query(`INSERT INTO users (id, email, google_id, name, photo, access_token, refresh_token, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'))`, [newId, email, googleId, name, photo, accessToken, refreshToken]);
                user = await database_1.default.query('SELECT * FROM users WHERE id = $1', [newId]);
            }
            else {
                // Update tokens
                await database_1.default.query(`UPDATE users 
                     SET access_token = $1, 
                         refresh_token = COALESCE($2, refresh_token),
                         updated_at = datetime('now')
                     WHERE google_id = $3`, [accessToken, refreshToken, googleId]);
                user = await database_1.default.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
            }
            return done(null, user.rows[0]);
        }
        catch (error) {
            return done(error, undefined);
        }
    }));
}
else {
    console.warn('⚠️ Google Client ID/Secret not configured. OAuth will not work.');
}
exports.default = passport_1.default;
//# sourceMappingURL=passport.js.map