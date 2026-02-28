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
            const uuidHook = require('uuid');

            if (user.rows.length === 0) {
                // Create new user
                const newId = uuidHook.v4();
                const workspaceId = `ws_${uuidHook.v4()}`;

                // Create root workspace
                await db.query(`INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, datetime('now'))`, [workspaceId, `${name}'s Workspace`]);

                await db.query(
                    `INSERT INTO users (id, default_workspace_id, email, google_id, name, photo, access_token, refresh_token, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'), datetime('now'))`,
                    [newId, workspaceId, email, googleId, name, photo, accessToken, refreshToken]
                );

                // Link to workspace
                await db.query(`INSERT INTO workspace_users (workspace_id, user_id, role, created_at) VALUES ($1, $2, 'admin', datetime('now'))`, [workspaceId, newId]);

                // Create oauth_account
                await db.query(
                    `INSERT INTO oauth_accounts (id, workspace_id, provider, email, access_token, refresh_token_encrypted, expires_at, created_at, updated_at)
                     VALUES ($1, $2, 'google', $3, $4, $5, datetime('now', '+1 hour'), datetime('now'), datetime('now'))`,
                    [`oauth_${uuidHook.v4()}`, workspaceId, email, accessToken, refreshToken]
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

                const wsId = user.rows[0].default_workspace_id;
                if (wsId) {
                    const existingOAuth = await db.query('SELECT id FROM oauth_accounts WHERE workspace_id = $1 AND email = $2', [wsId, email]);
                    if (existingOAuth.rows.length > 0) {
                        await db.query(
                            `UPDATE oauth_accounts 
                             SET access_token = $1, 
                                 refresh_token_encrypted = COALESCE($2, refresh_token_encrypted),
                                 updated_at = datetime('now')
                             WHERE id = $3`,
                            [accessToken, refreshToken, existingOAuth.rows[0].id]
                        );
                    } else {
                        await db.query(
                            `INSERT INTO oauth_accounts (id, workspace_id, provider, email, access_token, refresh_token_encrypted, expires_at, created_at, updated_at)
                             VALUES ($1, $2, 'google', $3, $4, $5, datetime('now', '+1 hour'), datetime('now'), datetime('now'))`,
                            [`oauth_${uuidHook.v4()}`, wsId, email, accessToken, refreshToken]
                        );
                    }
                }

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
