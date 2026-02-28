import { google } from 'googleapis';
import { simpleParser } from 'mailparser';
import * as ics from 'ics';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { Lead, EmailThreadInfo } from '../types';
import db from '../config/database';
import { analyticsTracker } from '../analytics/tracker';
import MailComposer from 'nodemailer/lib/mail-composer';

/**
 * Gmail REST API Service
 * Uses official googleapis package over port 443 to bypass strict SMTP blocking.
 */
export class EmailService {

    private getOAuthClient(email: string, accessToken: string, refreshToken: string) {
        const oAuth2Client = new google.auth.OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            config.googleCallbackUrl
        );

        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken
        });

        return oAuth2Client;
    }

    /**
     * Poll ALL IMAP inboxes for new unread messages
     */
    async pollAllInboxes(): Promise<Lead[]> {
        if (!config.enableRealEmail) return [];

        let allNewLeads: Lead[] = [];

        try {
            // Get all connected OAuth accounts
            const accounts = await db.query(
                `SELECT workspace_id, email, access_token, refresh_token_encrypted as refresh_token FROM oauth_accounts WHERE provider = 'google' AND refresh_token_encrypted IS NOT NULL`
            );

            for (const account of accounts.rows) {
                try {
                    const leads = await this.pollWorkspaceInbox(account.workspace_id, account.email, account.access_token, account.refresh_token);
                    allNewLeads.push(...leads);
                } catch (err) {
                    console.error(`Error polling inbox for workspace ${account.workspace_id}:`, err);
                }
            }

            return allNewLeads;
        } catch (error) {
            console.error('Error in multi-tenant Google REST inbox poller:', error);
            return [];
        }
    }

    /**
     * Poll a specific workspace's inbox using Gmail API
     */
    private async pollWorkspaceInbox(workspaceId: string, email: string, accessToken: string, refreshToken: string): Promise<Lead[]> {
        try {
            const auth = this.getOAuthClient(email, accessToken, refreshToken);
            const gmail = google.gmail({ version: 'v1', auth });

            // CRITICAL: Only filter leads we contacted for this workspace
            const outboundLeads = await db.query(`
                SELECT DISTINCT l.email 
                FROM leads l
                JOIN messages m ON l.id = m.lead_id
                WHERE m.direction = 'outbound' AND l.workspace_id = $1
            `, [workspaceId]);

            const newLeads: Lead[] = [];

            if (outboundLeads.rows.length === 0) return [];

            console.log(`Checking UNREAD Gmail threads for ${outboundLeads.rows.length} leads in workspace ${workspaceId}...`);

            // To avoid making 100 queries, we can construct a unified query or iterate
            for (const row of outboundLeads.rows) {
                const leadEmail = row.email as string;

                try {
                    const res = await gmail.users.messages.list({
                        userId: 'me',
                        q: `is:unread from:${leadEmail}`
                    });

                    if (res.data.messages && res.data.messages.length > 0) {
                        for (const msg of res.data.messages) {
                            if (!msg.id) continue;

                            // Fetch RAW format to use simpleParser
                            const rawRes = await gmail.users.messages.get({
                                userId: 'me',
                                id: msg.id,
                                format: 'raw'
                            });

                            if (!rawRes.data.raw) continue;

                            const buffer = Buffer.from(rawRes.data.raw, 'base64url');
                            const lead = await this.processMessage(workspaceId, msg.id, buffer);

                            if (lead) {
                                newLeads.push(lead);
                            }

                            // Mark as read
                            await gmail.users.messages.modify({
                                userId: 'me',
                                id: msg.id,
                                requestBody: {
                                    removeLabelIds: ['UNREAD']
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error checking emails from ${leadEmail}:`, error);
                }
            }

            return newLeads;
        } catch (error) {
            console.error('Error polling Gmail REST API:', error);
            return [];
        }
    }

    /**
     * Parse raw email and register inbound message map
     */
    private async processMessage(workspaceId: string, providerMsgId: string, rawBuffer: Buffer): Promise<Lead | null> {
        const parsed = await simpleParser(rawBuffer);

        const from = parsed.from?.value[0];
        if (!from || !from.address) {
            return null;
        }

        const email = from.address.toLowerCase();

        // 1. Ignore noreply/system/marketing emails
        const ignorePatterns = [
            'noreply', 'no-reply', 'donotreply', 'mailer-daemon',
            'marketing', 'newsletter', 'updates', 'support', 'alert', 'notification',
            'facebook', 'linkedin', 'twitter', 'instagram', 'pinterest', 'tiktok',
            'google', 'microsoft', 'amazon', 'apple', 'service', 'info'
        ];

        if (ignorePatterns.some(pattern => email.includes(pattern))) {
            return null;
        }

        const name = from.name || email.split('@')[0];
        const subject = parsed.subject || '(no subject)';
        const body = parsed.text || parsed.html || '(no body)'; // Prefer text
        const messageId = parsed.messageId || providerMsgId;
        const inReplyTo = parsed.inReplyTo;

        // Get or create lead scoped to this workspace
        let lead = await this.getOrCreateLead(workspaceId, email, name);

        if (from.name && lead.name === email.split('@')[0] && from.name !== lead.name) {
            await db.query('UPDATE leads SET name = $1 WHERE id = $2', [from.name, lead.id]);
            lead.name = from.name;
        }

        // Store message
        await db.query(
            `INSERT INTO messages (id, workspace_id, lead_id, direction, gmail_thread_id, message_id, in_reply_to, subject, body, sent_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, datetime('now'))`,
            [
                uuidv4(),
                workspaceId,
                lead.id,
                'inbound',
                null,
                messageId,
                inReplyTo,
                subject,
                body,
            ]
        );

        console.log(`Stored inbound message from ${email}`);

        // Track analytics event for reply received
        await analyticsTracker.track('reply_received', lead.workspace_id, lead.id);

        return lead;
    }

    private async getOrCreateLead(workspaceId: string, email: string, name?: string): Promise<Lead> {
        const existing = await db.query('SELECT * FROM leads WHERE email = $1 AND workspace_id = $2', [email, workspaceId]);

        if (existing.rows.length > 0) {
            return this.rowToLead(existing.rows[0]);
        }

        const leadId = uuidv4();
        // Since user_id is NOT NULL in the legacy architecture, we fetch an arbitrary admin user for this workspace to link as owner, or use a system placeholder if strictly migrating
        const wsUser = await db.query('SELECT user_id FROM workspace_users WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
        const fallbackUserId = wsUser.rows.length > 0 ? wsUser.rows[0].user_id : 'legacy_admin';

        await db.query(
            `INSERT INTO leads (id, workspace_id, user_id, email, name, source, status, last_contact_at, created_at)
             VALUES ($1, $2, $3, $4, $5, 'email', 'new', datetime('now'), datetime('now'))`,
            [leadId, workspaceId, fallbackUserId, email, name || email.split('@')[0]]
        );

        const newLead = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
        return this.rowToLead(newLead.rows[0]);
    }

    /**
     * Compile MIME message and transmit over HTTPS (Port 443) using Gmail API
     */
    async sendEmail(
        workspaceId: string,
        lead: Lead,
        subject: string,
        body: string,
        inReplyToId?: string | null,
        attachments?: any[]
    ): Promise<{ sent: boolean; messageId?: string; reason?: string }> {
        if (!config.enableRealEmail) {
            console.log(`[MOCK EMAIL] To: ${lead.email}, Subject: ${subject}`);
            return { sent: true, messageId: `mock-${uuidv4()}` };
        }

        try {
            const res = await db.query('SELECT email, access_token, refresh_token_encrypted as refresh_token FROM oauth_accounts WHERE workspace_id = $1 AND provider = $2 LIMIT 1', [workspaceId, 'google']);

            if (res.rows.length === 0) {
                return { sent: false, reason: 'No Google OAuth account configured for this workspace' };
            }

            const { email, access_token, refresh_token } = res.rows[0];
            const auth = this.getOAuthClient(email, access_token, refresh_token);
            const gmail = google.gmail({ version: 'v1', auth });

            // Compose raw MIME email bytes
            const mailOptions: any = {
                from: `"${config.businessName}" <${email}>`,
                to: lead.email,
                subject: subject,
                html: body,
                text: body.replace(/<[^>]*>?/gm, ''),
            };

            if (inReplyToId) {
                mailOptions.inReplyTo = inReplyToId;
                mailOptions.references = inReplyToId;
            }

            if (attachments) {
                mailOptions.attachments = attachments;
            }

            const composer = new MailComposer(mailOptions);
            const rawMessageBuffer = await composer.compile().build();
            const raw = rawMessageBuffer.toString('base64url'); // Requires Node >= 14.18

            // Submit strictly via Port 443 REST payload
            const result = await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw }
            });

            // True provider ID guaranteed delivered
            const trueMessageId = result.data.id;

            await analyticsTracker.track('email_sent', lead.workspace_id, lead.id);

            return { sent: true, messageId: trueMessageId || undefined };

        } catch (error: any) {
            console.error('Error sending GMAIL REST Payload:', error);
            // Some google failures have response body
            return { sent: false, reason: error?.response?.data?.error?.message || String(error) };
        }
    }

    /**
     * Generate ICS Calendar Invite
     */
    generateCalendarInvite(
        event: { start: Date; durationMinutes: number; title: string; description: string; location?: string; url?: string },
        attendee: { name: string; email: string }
    ): string {
        const startDate = event.start;
        const year = startDate.getFullYear();
        const month = startDate.getMonth() + 1;
        const day = startDate.getDate();
        const hour = startDate.getHours();
        const minute = startDate.getMinutes();

        const { error, value } = ics.createEvent({
            start: [year, month, day, hour, minute],
            duration: { minutes: event.durationMinutes },
            title: event.title,
            description: event.description,
            location: event.location || 'Remote Video Call',
            url: event.url,
            status: 'CONFIRMED',
            busyStatus: 'BUSY',
            organizer: { name: config.businessName, email: config.smtp.user },
            attendees: [
                { name: attendee.name, email: attendee.email, rsvp: true, partstat: 'NEEDS-ACTION', role: 'REQ-PARTICIPANT' },
                { name: config.businessName, email: config.smtp.user, rsvp: true, partstat: 'ACCEPTED', role: 'CHAIR' }
            ]
        });

        if (error) {
            console.error('Error generating ICS:', error);
            return '';
        }

        return value || '';
    }

    /**
     * Get thread info for replying
     */
    async getThreadInfo(leadId: string): Promise<EmailThreadInfo | null> {
        const result = await db.query(
            `SELECT gmail_thread_id, message_id, subject 
             FROM messages 
             WHERE lead_id = $1 AND direction = 'inbound' 
             ORDER BY sent_at DESC 
             LIMIT 1`,
            [leadId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return {
            gmail_thread_id: result.rows[0].gmail_thread_id || '',
            message_id: result.rows[0].message_id || '',
            subject: result.rows[0].subject,
        };
    }

    private rowToLead(row: any): Lead {
        return {
            id: row.id,
            workspace_id: row.workspace_id,
            email: row.email,
            name: row.name,
            phone: row.phone,
            company: row.company,
            source: row.source,
            status: row.status,
            opted_out: !!row.opted_out,
            followup_count: row.followup_count || 0,
            last_contact_at: row.last_contact_at,
            next_action_at: row.next_action_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
}

export default new EmailService();
