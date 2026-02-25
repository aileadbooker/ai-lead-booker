import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { simpleParser, AddressObject } from 'mailparser';
import * as ics from 'ics';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { Lead, EmailThreadInfo } from '../types';
import db from '../config/database';
import { analyticsTracker } from '../analytics/tracker';

/**
 * Standard Email Service (SMTP/IMAP)
 * Replaces GmailService for production use without Google Cloud
 */
export class EmailService {
    private transporter!: nodemailer.Transporter;

    constructor() {
        if (!config.enableRealEmail) {
            console.log('Real email disabled. EmailService will not send/receive.');
            return;
        }

        this.transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.port === 465, // true for 465, false for other ports
            auth: {
                user: config.smtp.user,
                pass: config.smtp.pass,
            },
        });
    }

    /**
     * Poll IMAP inbox for new unread messages
     */
    async pollInbox(): Promise<Lead[]> {
        if (!config.enableRealEmail) return [];

        let connection: imaps.ImapSimple | null = null;

        try {
            // Dynamic IMAP Config
            let imapUser = config.imap.user;
            let imapPass = config.imap.pass;

            // Try to load from DB
            try {
                const userRes = await db.query('SELECT email, google_app_password FROM users WHERE google_app_password IS NOT NULL LIMIT 1');
                if (userRes.rows.length > 0) {
                    imapUser = userRes.rows[0].email;
                    imapPass = userRes.rows[0].google_app_password;
                    console.log(`Using App Password for IMAP (${imapUser})`);
                }
            } catch (e) {
                console.warn('Failed to load IMAP creds from DB, using env fallback');
            }

            const imapConfig = {
                imap: {
                    user: imapUser,
                    password: imapPass,
                    host: config.imap.host,
                    port: config.imap.port,
                    tls: true,
                    tlsOptions: { rejectUnauthorized: false },
                    authTimeout: 10000,
                },
            };

            console.log('Connecting to IMAP...');
            connection = await imaps.connect(imapConfig);
            await connection.openBox('INBOX');

            // CRITICAL: Only fetch emails from leads WE contacted (those with outbound messages)
            // This prevents fetching 9000+ unread spam emails
            const outboundLeads = await db.query(`
                SELECT DISTINCT l.email 
                FROM leads l
                JOIN messages m ON l.id = m.lead_id
                WHERE m.direction = 'outbound'
            `);

            console.log(`Checking UNSEEN emails from ${outboundLeads.rows.length} leads we contacted...`);

            const newLeads: Lead[] = [];

            // For each lead we contacted, check for UNSEEN replies
            for (const row of outboundLeads.rows) {
                const leadEmail = row.email as string;

                try {
                    const searchCriteria = ['UNSEEN', ['FROM', leadEmail]];
                    const fetchOptions = {
                        bodies: ['HEADER', 'TEXT', ''],
                        markSeen: false,
                    };

                    const messages = await connection.search(searchCriteria, fetchOptions);

                    if (messages.length > 0) {
                        console.log(`Found ${messages.length} unread message(s) from ${leadEmail}`);
                    }

                    for (const message of messages) {
                        try {
                            const lead = await this.processMessage(message);
                            if (lead) {
                                newLeads.push(lead);
                                // Mark as seen
                                await connection.addFlags(message.attributes.uid, '\\Seen');
                            }
                        } catch (error) {
                            console.error(`Error processing email UID ${message.attributes.uid}:`, error);
                        }
                    }
                } catch (error) {
                    console.error(`Error checking emails from ${leadEmail}:`, error);
                }
            }

            connection.end();
            return newLeads;
        } catch (error) {
            console.error('Error polling IMAP inbox:', error);
            if (connection) connection.end();
            return [];
        }
    }

    /**
     * Process a single IMAP message
     */
    private async processMessage(message: imaps.Message): Promise<Lead | null> {
        const allParts = message.parts.find(part => part.which === '');
        const idHeader = message.parts.find(part => part.which === 'HEADER');

        if (!allParts || !allParts.body) {
            console.warn('Skipping message with no body part');
            return null;
        }

        const parsed = await simpleParser(allParts.body);

        const from = parsed.from?.value[0];
        if (!from || !from.address) {
            console.warn('Skipping message with no From address');
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
            console.log(`Skipping ignored sender: ${email}`);
            return null;
        }

        const name = from.name || email.split('@')[0];
        const subject = parsed.subject || '(no subject)';
        const body = parsed.text || parsed.html || '(no body)'; // Prefer text
        const messageId = parsed.messageId || uuidv4();
        const inReplyTo = parsed.inReplyTo;

        // Get or create lead
        let lead = await this.getOrCreateLead(email, name);

        // Update name if we have a better one now (and the old one was just the email prefix)
        if (from.name && lead.name === email.split('@')[0] && from.name !== lead.name) {
            console.log(`Updating lead name from "${lead.name}" to "${from.name}"`);
            await db.query('UPDATE leads SET name = $1 WHERE id = $2', [from.name, lead.id]);
            lead.name = from.name;
        }

        // Store message
        await db.query(
            `INSERT INTO messages (id, lead_id, direction, gmail_thread_id, message_id, in_reply_to, subject, body, sent_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
            [
                uuidv4(),
                lead.id,
                'inbound',
                null, // No Gmail thread ID in standard IMAP
                messageId,
                inReplyTo,
                subject,
                body,
            ]
        );

        console.log(`Stored inbound message from ${email}`);

        // Track analytics event for reply received
        await analyticsTracker.track('reply_received', lead.id);

        return lead;
    }

    /**
     * Get or create lead by email
     */
    private async getOrCreateLead(email: string, name?: string): Promise<Lead> {
        const existing = await db.query('SELECT * FROM leads WHERE email = $1', [email]);

        if (existing.rows.length > 0) {
            return this.rowToLead(existing.rows[0]);
        }

        const leadId = uuidv4();
        await db.query(
            `INSERT INTO leads (id, email, name, source, status, last_contact_at, created_at)
             VALUES ($1, $2, $3, 'email', 'new', datetime('now'), datetime('now'))`,
            [leadId, email, name || email.split('@')[0]]
        );

        const newLead = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
        return this.rowToLead(newLead.rows[0]);
    }

    /**
     * Get the appropriate transporter (OAuth or SMTP)
     */
    private async getTransporter(): Promise<nodemailer.Transporter | null> {
        // 1. Try to find a user with Google tokens OR App Password
        try {
            const res = await db.query('SELECT email, access_token, refresh_token, google_id, google_app_password, google_account_email FROM users LIMIT 1');
            if (res.rows.length > 0) {
                const user = res.rows[0];

                // A. Try App Password (Preferred for IMAP/SMTP simplicity)
                // We use google_account_email if explicitly provided, otherwise fallback to their login email
                if (user.google_app_password) {
                    const senderEmail = user.google_account_email || user.email;
                    console.log(`Using App Password for sender: ${senderEmail}`);

                    return nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            user: senderEmail,
                            pass: user.google_app_password,
                        },
                    });
                }

                // B. Try OAuth (Fallback)
                if (user.access_token) {
                    return nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            type: 'OAuth2',
                            user: user.email,
                            clientId: config.googleClientId,
                            clientSecret: config.googleClientSecret,
                            refreshToken: user.refresh_token,
                            accessToken: user.access_token,
                        },
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load Google user for transport:', error);
        }

        // 2. Fallback to SMTP from env
        if (this.transporter) return this.transporter;

        // 3. Fallback/Init SMTP if not already done
        if (config.smtp.host) {
            this.transporter = nodemailer.createTransport({
                host: config.smtp.host,
                port: config.smtp.port,
                secure: config.smtp.port === 465,
                auth: {
                    user: config.smtp.user,
                    pass: config.smtp.pass,
                },
            });
            return this.transporter;
        }

        return null;
    }

    /**
     * Send email via SMTP
     */
    async sendEmail(
        lead: Lead,
        subject: string,
        body: string,
        threadInfo?: EmailThreadInfo,
        attachments?: any[] // Support attachments (like ICS)
    ): Promise<{ sent: boolean; messageId?: string; reason?: string }> {
        if (!config.enableRealEmail) {
            console.log(`[MOCK EMAIL] To: ${lead.email}, Subject: ${subject}`);
            await analyticsTracker.track('email_sent', lead.id);
            return { sent: true, messageId: `mock-${uuidv4()}` };
        }

        try {
            const transporter = await this.getTransporter();
            if (!transporter) {
                console.error('No email transport configured (neither OAuth nor SMTP)');
                return { sent: false, reason: 'No email transport configured' };
            }

            // Retrieve Sender config dynamically to ensure 'From:' matches the connected account
            const res = await db.query('SELECT email, google_account_email FROM users LIMIT 1');
            const user = res.rows[0] || {};
            const senderEmail = user.google_account_email || config.gmailUserEmail || config.smtp.user;

            const mailOptions: nodemailer.SendMailOptions = {
                from: `"${config.businessName}" <${senderEmail}>`,
                to: lead.email,
                subject: subject,
                html: body,
                text: body.replace(/<[^>]*>?/gm, ''), // Simple strip HTML for fallback
            };

            // Add threading headers if replying
            if (threadInfo && threadInfo.message_id) {
                mailOptions.inReplyTo = threadInfo.message_id;
                mailOptions.references = threadInfo.message_id;
            }

            if (attachments) {
                mailOptions.attachments = attachments;
            }

            const info = await transporter.sendMail(mailOptions);
            const sentMessageId = info.messageId;

            // Store sent message
            await db.query(
                `INSERT INTO messages (id, lead_id, direction, message_id, in_reply_to, subject, body, sent_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
                [
                    uuidv4(),
                    lead.id,
                    'outbound',
                    sentMessageId,
                    threadInfo?.message_id,
                    subject,
                    body,
                ]
            );

            console.log(`Email sent to ${lead.email}, message ID: ${sentMessageId}`);

            // Track analytics event
            await analyticsTracker.track('email_sent', lead.id);

            return { sent: true, messageId: sentMessageId };

        } catch (error) {
            console.error('Error sending email:', error);
            return { sent: false, reason: String(error) };
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
    async sendAdminReport(subject: string, html: string): Promise<void> {
        if (!config.enableRealEmail) {
            console.log(`[Shadow Mode] Admin Report "${subject}" would be sent.`);
            return;
        }

        try {
            await this.transporter.sendMail({
                from: `"${config.businessName}" <${config.gmailUserEmail}>`,
                to: config.gmailUserEmail, // Send to self
                subject: `📊 ${subject}`,
                html: html,
            });
            console.log(`Admin report sent: ${subject}`);
        } catch (error) {
            console.error('Failed to send admin report:', error);
        }
    }
}

export default new EmailService();
