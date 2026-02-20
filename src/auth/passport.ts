import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import db from '../config/database';

passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            done(null, result.rows[0]);
        } else {
            done(null, null);
        }
    } catch (error) {
        done(error, null);
    }
});

if (config.googleClientId && config.googleClientSecret) {
    passport.use(new GoogleStrategy({
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        callbackURL: config.googleCallbackUrl || '/auth/google/callback',
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
        passReqToCallback: true,
    }, async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
            const email = profile.emails?.[0].value;
            const googleId = profile.id;
            const name = profile.displayName;
            const photo = profile.photos?.[0].value;

            // Check if user exists
            let user = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

            if (user.rows.length === 0) {
                // Create new user
                const uuidHook = require('uuid');
                const newId = uuidHook.v4();

                await db.query(
                    `INSERT INTO users (id, email, google_id, name, photo, access_token, refresh_token, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'))`,
                    [newId, email, googleId, name, photo, accessToken, refreshToken]
                );

                user = await db.query('SELECT * FROM users WHERE id = $1', [newId]);
            } else {
                // Update tokens
                await db.query(
                    `UPDATE users 
                     SET access_token = $1, 
                         refresh_token = COALESCE($2, refresh_token),
                         updated_at = datetime('now')
                     WHERE google_id = $3`,
                    [accessToken, refreshToken, googleId]
                );
                user = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
            }

            return done(null, user.rows[0]);
        } catch (error) {
            return done(error as any, undefined);
        }
    }));
} else {
    console.warn('⚠️ Google Client ID/Secret not configured. OAuth will not work.');
}

export default passport;
